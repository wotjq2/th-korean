// 크롬 '실시간 자막'(Live Caption)을 한국어로 덮기.
// 크롬은 탭에서 나는 소리를 이 PC 안에서 글자로 바꿔 '실시간 자막' 창에 띄운다(설정 → 접근성 → 실시간 자막.
// 2026-11-01 이 PC: 태국어 등 17개 언어). 그 창은 웹페이지가 아니라 크롬 화면이라 확장은 못 읽고, 이 도우미가
// UI Automation 으로 읽는다: Chrome_WidgetWin_1 창 안의 Document(CaptionBubbleLabel), 그 아래 줄마다
// Text(AXVirtualView). 태국어는 낱말마다 띄어 온다(ก็ คือ ต้อง ยอม …).
// 다 쓴 줄(맨 아래가 아닌 줄)은 바로, 아직 쓰는 맨 아래 줄은 0.7초 멈추면 옮기고(engine 'caption' — 용어집 먼저,
// 없으면 구글), 자막 글자 자리를 한국어로 덮는다(클릭은 그대로 통과). 줄마다 한 번만 물어 저장해 둔다.
// 페이스북·틱톡처럼 자막 파일이 없는 영상도 크롬에서 소리가 나면 된다.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

static class LiveCaption
{
    public static bool On = true;
    static Engine engine;
    static CaptionCover cover;
    static AutomationElement label;
    static readonly object lk = new object();
    static readonly Dictionary<string, string> done = new Dictionary<string, string>(); // 줄 → 한국어('' = 못 옮김)
    static readonly HashSet<string> asking = new HashSet<string>();
    static string tail = "";
    static DateTime tailSince = DateTime.MinValue;
    static bool seen;
    static readonly Regex Hangul = new Regex("[가-힣]");
    static readonly Regex Foreign = new Regex("[฀-๿A-Za-z぀-ヿ一-鿿]");
    static readonly Regex ThaiGap = new Regex("([฀-๿])\\s+(?=[฀-๿])");
    static readonly Regex ThaiRun = new Regex("[฀-๿][฀-๿\\s]*");

    // UI 스레드에서 부른다(덮개 창을 그 스레드에 만든다).
    public static void Start(Engine e)
    {
        engine = e;
        cover = new CaptionCover();
        IntPtr force = cover.Handle;
        new Thread(Loop) { IsBackground = true }.Start();
    }

    static void Loop()
    {
        while (true)
        {
            int wait = 350;
            try { wait = Tick(); }
            catch (Exception) { label = null; Hide(); } // 자막 창이 닫혔다
            Thread.Sleep(wait);
        }
    }

    // 다음 볼 때까지 쉴 시간(ms)을 돌려준다. 자막 창이 없으면 천천히 찾는다.
    static int Tick()
    {
        if (!On) { Hide(); return 1000; }
        if (label == null) label = Find();
        if (label == null) { Hide(); return 1500; }
        System.Windows.Rect b = label.Current.BoundingRectangle;
        if (b.IsEmpty || b.Width < 30 || b.Height < 10) { Hide(); return 500; }
        if (!seen) { seen = true; Log.Write("실시간 자막: 크롬 자막 창을 찾음 — 한국어로 덮습니다"); }
        List<string> lines = Lines(label);
        string all = string.Join(" ", lines.ToArray());
        // 비었거나, 크롬 '자막 번역' 으로 모두 한국어면 덮지 않는다.
        if (lines.Count == 0 || (Hangul.IsMatch(all) && !Foreign.IsMatch(all))) { Hide(); return 350; }
        for (int i = 0; i < lines.Count; i++)
        {
            string line = lines[i];
            lock (lk) { if (done.ContainsKey(line) || asking.Contains(line)) continue; }
            // 크롬 '자막 번역' 을 켜 두면 다 옮긴 줄은 한국어로, 아직 받아 적는 끝부분만 태국어로 온다(2026-11-01
            // 실제로 섞여 왔다). 한국어가 든 줄은 묻지 않고 한국어 부분만 보인다 — 한국어를 다시 번역에 넣으면 같은
            // 말이 돌아와 '번역 결과가 비어 있습니다' 로 실패했다.
            if (Hangul.IsMatch(line))
            {
                string kept = Regex.Replace(ThaiRun.Replace(line, " "), "\\s{2,}", " ").Trim();
                lock (lk) done[line] = kept;
                continue;
            }
            if (i == lines.Count - 1)
            {
                // 아직 받아 적는 줄 — 글자가 0.7초 그대로면(말이 멈추면) 옮긴다.
                if (line != tail) { tail = line; tailSince = DateTime.Now; continue; }
                if ((DateTime.Now - tailSince).TotalMilliseconds < 700) continue;
            }
            Ask(line);
        }
        List<string> ko = new List<string>();
        lock (lk)
        {
            foreach (string l in lines)
            {
                string k;
                if (done.TryGetValue(l, out k) && k.Length > 0) ko.Add(k);
            }
        }
        if (ko.Count == 0) { Hide(); return 350; }
        Rectangle r = new Rectangle((int)b.X, (int)b.Y, (int)b.Width, (int)b.Height);
        cover.BeginInvoke((MethodInvoker)delegate { cover.Set(r, ko); });
        return 350;
    }

    static void Ask(string line)
    {
        lock (lk) asking.Add(line);
        ThreadPool.QueueUserWorkItem(delegate
        {
            string ko = "";
            try { ko = engine.Call("caption", "", ThaiGap.Replace(line, "$1"), 10000)[0]; }
            catch (Exception e) { Log.Write("실시간 자막 번역 실패: " + e.Message); }
            lock (lk)
            {
                asking.Remove(line);
                if (done.Count > 600) done.Clear();
                done[line] = ko ?? "";
            }
        });
    }

    // 브라우저 창(큰 창)은 건너뛰고 작은 크롬 창 안에서 자막 글자 칸을 찾는다.
    static AutomationElement Find()
    {
        PropertyCondition chrome = new PropertyCondition(AutomationElement.ClassNameProperty, "Chrome_WidgetWin_1");
        PropertyCondition cap = new PropertyCondition(AutomationElement.ClassNameProperty, "CaptionBubbleLabel");
        foreach (AutomationElement w in AutomationElement.RootElement.FindAll(TreeScope.Children, chrome))
        {
            System.Windows.Rect r = w.Current.BoundingRectangle;
            if (r.IsEmpty || r.Width > 1400 || r.Height > 900) continue;
            AutomationElement found = w.FindFirst(TreeScope.Descendants, cap);
            if (found != null) return found;
        }
        return null;
    }

    static List<string> Lines(AutomationElement lab)
    {
        List<string> list = new List<string>();
        foreach (AutomationElement k in lab.FindAll(TreeScope.Children, Condition.TrueCondition))
        {
            string n = k.Current.Name;
            if (!string.IsNullOrEmpty(n) && n.Trim().Length > 0) list.Add(n.Trim());
        }
        if (list.Count == 0)
        {
            string n = lab.Current.Name;
            if (!string.IsNullOrEmpty(n) && n.Trim().Length > 0) list.Add(n.Trim());
        }
        return list;
    }

    static void Hide()
    {
        if (cover != null && cover.IsHandleCreated) cover.BeginInvoke((MethodInvoker)delegate { if (cover.Visible) cover.Hide(); });
    }
}

// 자막 글자 자리를 덮는 한국어 창. 크롬 자막 상자 색(어두운 회색)에 흰 글자, 클릭은 아래로 통과한다.
class CaptionCover : Form
{
    List<string> lines = new List<string>();
    Rectangle at = Rectangle.Empty;

    public CaptionCover()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(32, 33, 36);
        Opacity = 0.97; // 겹친 창(layered) — 클릭 통과(WS_EX_TRANSPARENT)에 필요하다
        DoubleBuffered = true;
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_TOPMOST | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | Native.WS_EX_LAYERED | Native.WS_EX_TRANSPARENT;
            return cp;
        }
    }

    public void Set(Rectangle r, List<string> ko)
    {
        bool same = r == at && Visible && string.Join("\n", ko.ToArray()) == string.Join("\n", lines.ToArray());
        lines = ko;
        at = r;
        // 크롬 자막 창도 맨 위라서, 바뀔 때마다 그 위로 다시 올린다.
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, r.X, r.Y, r.Width, r.Height, Native.SWP_NOACTIVATE);
        if (!Visible) Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
        if (!same) Invalidate();
    }

    // 칸에 다 들어가는 가장 큰 글자(22→14px)로, 아래쪽에 붙여 쓴다. 14px 로도 넘치면 오래된 줄부터 뺀다.
    // (여러 줄 글자는 TextFormatFlags.Bottom 이 먹지 않아 높이를 재서 직접 내린다.)
    protected override void OnPaint(PaintEventArgs e)
    {
        TextFormatFlags f = TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix;
        Rectangle box = new Rectangle(8, 4, Math.Max(10, Width - 16), Math.Max(10, Height - 8));
        List<string> show = new List<string>(lines);
        while (show.Count > 0)
        {
            string text = string.Join("\n", show.ToArray());
            for (int px = 22; px >= 14; px -= 2)
            {
                using (Font font = new Font("Malgun Gothic", px, FontStyle.Regular, GraphicsUnit.Pixel))
                {
                    Size need = TextRenderer.MeasureText(text, font, new Size(box.Width, 0), f);
                    if (need.Height <= box.Height || (px == 14 && show.Count == 1))
                    {
                        Rectangle at2 = new Rectangle(box.X, Math.Max(box.Y, box.Bottom - need.Height), box.Width, Math.Min(box.Height, need.Height));
                        TextRenderer.DrawText(e.Graphics, text, font, at2, Color.White, BackColor, f);
                        return;
                    }
                }
            }
            show.RemoveAt(0);
        }
    }
}
