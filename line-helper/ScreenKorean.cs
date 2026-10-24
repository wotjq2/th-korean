// 화면 번역 — 아무 프로그램 창의 영어(등) 글자를 그 자리에 한국어로 덮어 보여 준다.
// 한국어를 지원하지 않는 프로그램(Cherry Studio 같은 것)을 위해. Ctrl+Alt+K 를 누르면 앞에 있는 창을 켜고,
// 같은 창에서 한 번 더 누르면 끈다. 다른 창에서 누르면 그 창으로 옮긴다.
// 창을 그림으로 떠서(PrintWindow — 다른 창에 가려져도 된다) 윈도우에 들어 있는 OCR(Windows.Media.Ocr)로
// 글줄과 자리를 찾고, engine.js(screen)가 헷갈린 줄을 영어 OCR 로 다시 읽어 스크립트와 같은 번역으로 옮긴다.
// 그 뒤 글줄마다 바탕색으로 덮고 한국어를 써 넣은 투명 창을 그 창 바로 위에 겹친다. 마우스는 아래 창으로 간다.
// 창 내용이 바뀌면(스크롤, 다른 화면) 멈추기를 기다렸다가 다시 읽는다. 한 번 옮긴 글줄은 기억해 두고 다시 묻지 않는다.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

// 창 그림 속 글 덩어리 하나(한 줄, 또는 이어지는 여러 줄). 자리는 창 왼쪽 위 기준.
class TextChunk
{
    public Rectangle Box;
    public string Text = "";
    public int LineH;
    public float Em;      // 원문 글씨 크기(픽셀) 어림
    public int Right;     // 오른쪽으로 넓혀 써도 되는 끝(바탕만 이어지는 데까지)
    public int Lines = 1;
    public Color Bg, Fg;
    public string Ko;
}

// 대상 창 위에 겹치는 투명 창. 대상 창에 딸려 있어(owner) 다른 창이 덮으면 같이 덮이고, 내리면 같이 숨는다.
class ScreenOverlay : Form
{
    IntPtr owner = IntPtr.Zero;
    bool topmost;

    public ScreenOverlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TRANSPARENT | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return cp;
        }
    }

    public void Put(IntPtr win, Rectangle bounds, Bitmap bmp)
    {
        if (owner != win)
        {
            owner = win;
            Native.SetWindowLongPtr(Handle, Native.GWLP_HWNDPARENT, win);
        }
        bool shown = !Visible;
        if (!Visible) Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
        // 대상 창이 '항상 위' 면 이 창도 맨 위여야 밑에 깔리지 않는다.
        bool top = (Native.GetWindowLongPtr(win, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_TOPMOST) != 0;
        if (top != topmost)
        {
            topmost = top;
            Native.SetWindowPos(Handle, top ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
            shown = true;
        }
        if (shown && !top) PlaceAbove(win);
        IntPtr screen = Native.GetDC(IntPtr.Zero);
        IntPtr mem = Native.CreateCompatibleDC(screen);
        IntPtr hbmp = bmp.GetHbitmap(Color.FromArgb(0));
        IntPtr old = Native.SelectObject(mem, hbmp);
        Native.POINT pt = new Native.POINT { X = bounds.X, Y = bounds.Y };
        Native.SIZE sz = new Native.SIZE { W = bounds.Width, H = bounds.Height };
        Native.POINT src = new Native.POINT();
        Native.BLENDFUNCTION bf = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
        if (!Native.UpdateLayeredWindow(Handle, screen, ref pt, ref sz, mem, ref src, 0, ref bf, Native.ULW_ALPHA))
            Log.Write("화면 번역 그리기 실패: " + Marshal.GetLastWin32Error());
        Native.SelectObject(mem, old);
        Native.DeleteObject(hbmp);
        Native.DeleteDC(mem);
        Native.ReleaseDC(IntPtr.Zero, screen);
    }

    // 새로 띄운 창은 모든 창 맨 위로 온다. 대상 창 바로 위 칸으로 내린다 — 대상 창을 덮은 다른 창보다는 아래.
    void PlaceAbove(IntPtr win)
    {
        IntPtr above = Native.GetWindow(win, 3); // GW_HWNDPREV
        while (above != IntPtr.Zero && (above == Handle || !Native.IsWindowVisible(above)
            || (Native.GetWindowLongPtr(above, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_TOPMOST) != 0))
            above = Native.GetWindow(above, 3);
        Native.SetWindowPos(Handle, above, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
    }
}

static class ScreenKorean
{
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_NOREPEAT = 0x4000;
    const int WM_HOTKEY = 0x312;

    class HotkeyWindow : NativeWindow
    {
        public HotkeyWindow() { CreateHandle(new CreateParams()); }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY) Toggle();
            base.WndProc(ref m);
        }
    }

    public const string HotkeyName = "Ctrl+Alt+K";
    const int Grid = 48;       // 바뀜 비교용 칸 수(가로·세로)
    const int Tick = 400;      // 창을 다시 떠 보는 간격
    static Engine engine;
    static string dataDir;
    static Control ui;
    static ScreenOverlay overlay;
    static HotkeyWindow hotkey;
    static volatile IntPtr target = IntPtr.Zero;
    static volatile int gen;   // 켜고 끌 때마다 늘린다 — 늦게 끝난 읽기가 이전 창 것이면 버린다
    static OcrEngine ocr;
    static readonly Dictionary<string, string> done = new Dictionary<string, string>(); // 읽은 글자 → 한국어("" = 덮지 않음)
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static readonly Regex TwoLatin = new Regex("[A-Za-z].*[A-Za-z]");
    static int cropNo;

    public static bool On { get { return target != IntPtr.Zero; } }

    // testProcess: 시험용 — 그 프로그램의 주 창을 바로 켠다(--screen 이름).
    public static void Start(Engine e, string data, Control uiControl, string testProcess)
    {
        engine = e;
        dataDir = data;
        ui = uiControl;
        overlay = new ScreenOverlay();
        IntPtr force = overlay.Handle;
        hotkey = new HotkeyWindow();
        if (!RegisterHotKey(hotkey.Handle, 1, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, (uint)Keys.K))
            Log.Write("화면 번역: " + HotkeyName + " 를 다른 프로그램이 이미 쓰고 있습니다");
        new Thread(Loop) { IsBackground = true }.Start();
        if (testProcess == null) return;
        foreach (Process p in Process.GetProcessesByName(testProcess))
            if (p.MainWindowHandle != IntPtr.Zero && Native.IsWindowVisible(p.MainWindowHandle)) { TurnOn(p.MainWindowHandle); break; }
    }

    public static void Toggle()
    {
        IntPtr fg = Native.GetAncestor(Native.GetForegroundWindow(), Native.GA_ROOT);
        if (fg == IntPtr.Zero) return;
        uint pid;
        Native.GetWindowThreadProcessId(fg, out pid);
        if (pid == (uint)Process.GetCurrentProcess().Id) return;
        if (fg == target) Off();
        else TurnOn(fg);
    }

    static void TurnOn(IntPtr win)
    {
        gen++;
        target = win;
        HideOverlay();
        App.Show("화면 번역", "이 창 글자를 한국어로 바꾸는 중… (" + HotkeyName + " 한 번 더 = 끄기)", false, 3000);
        App.RefreshTray();
        Log.Write("화면 번역 켬: " + Title(win));
    }

    public static void Off()
    {
        if (target == IntPtr.Zero) return;
        gen++;
        target = IntPtr.Zero;
        HideOverlay();
        App.Show("화면 번역", "껐습니다 — 원래 글자로 돌아갑니다", false, 2000);
        App.RefreshTray();
        Log.Write("화면 번역 끔");
    }

    static string Title(IntPtr win)
    {
        StringBuilder s = new StringBuilder(256);
        GetWindowText(win, s, s.Capacity);
        return s.ToString();
    }

    // ---- 창 지켜보기 ----

    static void Loop()
    {
        int myGen = -1;
        int[] doneSig = null, lastSig = null;
        Rectangle doneRect = Rectangle.Empty;
        List<TextChunk> shown = null;
        bool told = false;
        while (true)
        {
            Thread.Sleep(Tick);
            IntPtr win = target;
            int g = gen;
            if (g != myGen) { myGen = g; doneSig = lastSig = null; shown = null; told = false; }
            if (win == IntPtr.Zero) continue;
            try
            {
                if (!IsWindow(win))
                {
                    if (target == win) { target = IntPtr.Zero; ui.BeginInvoke((MethodInvoker)App.RefreshTray); }
                    HideOverlay();
                    continue;
                }
                if (Native.IsIconic(win) || !Native.IsWindowVisible(win)) { HideOverlay(); doneSig = null; continue; }
                Rectangle r = Native.WindowRect(win);
                if (r.Width < 40 || r.Height < 30) continue;
                using (Bitmap bmp = Capture(win, r))
                {
                    int[] px = Pixels(bmp);
                    int[] sig = Signature(px, r.Width, r.Height);
                    bool sameSize = doneSig != null && r.Size == doneRect.Size;
                    // 깜빡이는 커서처럼 몇 칸만 바뀐 것은 그대로 둔다.
                    if (sameSize && Changed(sig, doneSig) <= 3)
                    {
                        if (r.Location != doneRect.Location) { doneRect = r; ShowOverlay(win, r, shown, g); }
                        lastSig = sig;
                        continue;
                    }
                    // 크기가 바뀌었거나 화면이 크게 바뀌었다 — 엉뚱한 자리를 덮지 않게 먼저 걷는다.
                    if (doneSig != null && (!sameSize || Changed(sig, doneSig) > Grid * Grid / 8)) HideOverlay();
                    bool settled = lastSig != null && Changed(sig, lastSig) <= 3;
                    lastSig = sig;
                    if (doneSig != null && !settled) continue; // 바뀌는 중(스크롤·애니메이션) — 멈추면 읽는다
                    Stopwatch sw = Stopwatch.StartNew();
                    List<TextChunk> chunks = Read(bmp, px);
                    long ocrMs = sw.ElapsedMilliseconds;
                    int asked = Translate(chunks, px, r.Width, r.Height);
                    if (gen != g) continue;
                    doneSig = sig;
                    doneRect = r;
                    shown = chunks;
                    ShowOverlay(win, r, chunks, g);
                    int covered = 0;
                    foreach (TextChunk c in chunks) if (!string.IsNullOrEmpty(c.Ko)) covered++;
                    Log.Write("화면 번역: 글줄 " + chunks.Count + " · 덮음 " + covered + " · 새로 물음 " + asked + " · OCR " + ocrMs + "ms · 전체 " + sw.ElapsedMilliseconds + "ms");
                }
            }
            catch (Exception e)
            {
                Log.Write("화면 번역 오류: " + e);
                if (!told && gen == g) { told = true; App.Show("화면 번역 실패", e.Message, true, 6000); }
                Thread.Sleep(1500);
            }
        }
    }

    static Bitmap Capture(IntPtr win, Rectangle r)
    {
        Bitmap bmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            IntPtr dc = g.GetHdc();
            try { Native.PrintWindow(win, dc, Native.PW_RENDERFULLCONTENT); }
            finally { g.ReleaseHdc(dc); }
        }
        return bmp;
    }

    // 그림의 점들. PrintWindow 는 투명도를 비워 두기도 해서 모두 불투명으로 고쳐 둔다(OCR·확대가 검게 읽지 않게).
    static int[] Pixels(Bitmap bmp)
    {
        BitmapData d = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int[] px = new int[bmp.Width * bmp.Height];
        Marshal.Copy(d.Scan0, px, 0, px.Length);
        for (int i = 0; i < px.Length; i++) px[i] |= unchecked((int)0xFF000000);
        Marshal.Copy(px, 0, d.Scan0, px.Length);
        bmp.UnlockBits(d);
        return px;
    }

    static int Luma(int c) { return (((c >> 16) & 255) * 299 + ((c >> 8) & 255) * 587 + (c & 255) * 114) / 1000; }

    // 창을 Grid×Grid 칸으로 나눈 칸마다의 평균 밝기(×10). 글자 하나만 바뀌어도 그 칸 평균이 움직인다.
    static int[] Signature(int[] px, int w, int h)
    {
        long[] sum = new long[Grid * Grid];
        int[] cnt = new int[Grid * Grid];
        for (int y = 0; y < h; y++)
        {
            int row = y * w, gy = y * Grid / h * Grid;
            for (int x = 0; x < w; x++)
            {
                int c = px[row + x], k = gy + x * Grid / w;
                sum[k] += ((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 6 + (c & 255);
                cnt[k]++;
            }
        }
        int[] s = new int[Grid * Grid];
        for (int k = 0; k < s.Length; k++) s[k] = (int)(sum[k] / Math.Max(1, cnt[k]));
        return s;
    }

    static int Changed(int[] a, int[] b)
    {
        int n = 0;
        for (int i = 0; i < a.Length; i++) if (Math.Abs(a[i] - b[i]) > 15) n++;
        return n;
    }

    // ---- 글줄 찾기(윈도우 OCR) ----

    static OcrEngine MakeOcr()
    {
        Windows.Globalization.Language en = new Windows.Globalization.Language("en-US");
        OcrEngine e = OcrEngine.IsLanguageSupported(en) ? OcrEngine.TryCreateFromLanguage(en) : null;
        if (e == null) e = OcrEngine.TryCreateFromUserProfileLanguages();
        if (e == null) throw new Exception("윈도우 OCR 을 쓸 수 없습니다");
        Log.Write("화면 번역: 윈도우 OCR " + e.RecognizerLanguage.LanguageTag);
        return e;
    }

    static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op)
    {
        while (op.Status == Windows.Foundation.AsyncStatus.Started) Thread.Sleep(5);
        if (op.Status != Windows.Foundation.AsyncStatus.Completed)
            throw new Exception("윈도우 OCR 실패" + (op.ErrorCode != null ? ": " + op.ErrorCode.Message : ""));
        return op.GetResults();
    }

    static byte[] Bytes(Bitmap b)
    {
        BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] buf = new byte[b.Width * b.Height * 4];
        Marshal.Copy(d.Scan0, buf, 0, buf.Length);
        b.UnlockBits(d);
        return buf;
    }

    static List<TextChunk> Read(Bitmap bmp, int[] px)
    {
        if (ocr == null) ocr = MakeOcr();
        int w = bmp.Width, h = bmp.Height;
        // 작은 글씨를 잘 읽게 두 배로 키워 읽는다(큰 창은 그대로).
        int scale = Math.Max(w, h) <= 1600 && Math.Max(w, h) * 2 <= OcrEngine.MaxImageDimension ? 2 : 1;
        if (Math.Max(w, h) > OcrEngine.MaxImageDimension) throw new Exception("창이 너무 큽니다");
        int sw = w * scale, sh = h * scale;
        byte[] buf;
        if (scale == 1)
        {
            buf = new byte[px.Length * 4];
            Buffer.BlockCopy(px, 0, buf, 0, buf.Length);
        }
        else
        {
            using (Bitmap big = new Bitmap(sw, sh, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(big))
                {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    g.DrawImage(bmp, 0, 0, sw, sh);
                }
                buf = Bytes(big);
            }
        }
        SoftwareBitmap sb = SoftwareBitmap.CreateCopyFromBuffer(Windows.Security.Cryptography.CryptographicBuffer.CreateFromByteArray(buf), BitmapPixelFormat.Bgra8, sw, sh);
        OcrResult res;
        try { res = Wait(ocr.RecognizeAsync(sb)); }
        finally { sb.Dispose(); }

        // 한 줄 안에서 글줄 높이보다 넓게 떨어진 낱말은 다른 덩어리(메뉴 칸·버튼이 한 줄로 읽힌 것)로 나눈다.
        List<TextChunk> chunks = new List<TextChunk>();
        foreach (OcrLine line in res.Lines)
        {
            List<Rectangle> boxes = new List<Rectangle>();
            List<string> texts = new List<string>();
            List<float> ems = new List<float>();
            int lh = 0;
            foreach (OcrWord wd in line.Words)
            {
                Windows.Foundation.Rect r = wd.BoundingRect;
                Rectangle b = Rectangle.FromLTRB((int)Math.Floor(r.X / scale), (int)Math.Floor(r.Y / scale),
                    (int)Math.Ceiling((r.X + r.Width) / scale), (int)Math.Ceiling((r.Y + r.Height) / scale));
                boxes.Add(b);
                texts.Add(wd.Text);
                lh = Math.Max(lh, b.Height);
                if (Word.IsMatch(wd.Text)) ems.Add(b.Height / InkShare(wd.Text));
            }
            ems.Sort();
            float em = ems.Count > 0 ? ems[ems.Count / 2] : lh;
            int start = 0;
            for (int i = 1; i <= boxes.Count; i++)
            {
                if (i < boxes.Count && boxes[i].Left - boxes[i - 1].Right <= Math.Max(10, lh * 1.2)) continue;
                TextChunk c = Chunk(boxes, texts, start, i, lh);
                if (c != null) { c.Em = em; chunks.Add(c); }
                start = i;
            }
        }
        chunks = Paragraphs(chunks);
        foreach (TextChunk c in chunks)
        {
            Colors(px, w, h, c);
            c.Right = RoomRight(px, w, h, c);
        }
        return chunks;
    }

    // 글줄 오른쪽으로 바탕색만 이어지는 끝. 아이콘·단추(창의 최소화 단추 같은 것)는 글자로 읽히지 않아도 여기서 멈춘다.
    static int RoomRight(int[] px, int w, int h, TextChunk c)
    {
        int bg = c.Bg.ToArgb(), top = Math.Max(0, c.Box.Top), bottom = Math.Min(h, c.Box.Bottom);
        for (int x = c.Box.Right + 3; x < w; x++)
            for (int y = top; y < bottom; y++)
                if (Chat.Dist(px[y * w + x], bg) > 60) return x - 4;
        return w - 2;
    }

    // 낱말 상자 높이가 글씨 크기의 얼마인지: 위로 솟는 글자(대문자·b·d·l…)와 아래로 처지는 글자(g·p·y…)가
    // 있느냐에 따라 다르다. 그대로 쓰면 같은 메뉴 줄에서도 'Help' 는 크게, 'File' 은 작게 옮겨진다.
    static float InkShare(string w)
    {
        bool up = Regex.IsMatch(w, "[A-Zbdfhiklt0-9]"), down = Regex.IsMatch(w, "[gjpqy]");
        return up ? (down ? 1.12f : 0.86f) : (down ? 0.78f : 0.62f);
    }

    // 영어 글줄 양 끝의 영문·숫자 없는 낱말은 글자 옆 아이콘(☑ → ∨)을 읽은 것이다 — 덩어리에서 빼야 아이콘이 덮이지 않는다.
    static readonly Regex Word = new Regex("[A-Za-z0-9]");
    static TextChunk Chunk(List<Rectangle> boxes, List<string> texts, int from, int to, int lh)
    {
        int latin = 0;
        for (int i = from; i < to; i++) latin += Regex.Matches(texts[i], "[A-Za-z]").Count;
        if (latin >= 3)
        {
            while (from < to && !Word.IsMatch(texts[from])) from++;
            while (to > from && !Word.IsMatch(texts[to - 1])) to--;
        }
        if (from >= to) return null;
        TextChunk c = new TextChunk { Box = boxes[from], Text = texts[from], LineH = lh };
        for (int i = from + 1; i < to; i++)
        {
            c.Box = Rectangle.Union(c.Box, boxes[i]);
            c.Text += " " + texts[i];
        }
        return c;
    }

    // 문단으로 이어지는 줄(바로 아래, 왼쪽이 맞고, 글씨 크기가 같고, 다음 줄이 소문자로 시작하는 등)은 한 덩어리로
    // 옮긴다 — 줄마다 따로 옮기면 문장이 끊긴다.
    static List<TextChunk> Paragraphs(List<TextChunk> chunks)
    {
        chunks.Sort(delegate (TextChunk a, TextChunk b) { return a.Box.Top != b.Box.Top ? a.Box.Top.CompareTo(b.Box.Top) : a.Box.Left.CompareTo(b.Box.Left); });
        List<TextChunk> merged = new List<TextChunk>();
        List<Rectangle> lastLine = new List<Rectangle>();
        foreach (TextChunk c in chunks)
        {
            int k = -1;
            for (int j = merged.Count - 1; j >= 0 && k < 0; j--)
            {
                TextChunk a = merged[j];
                int gap = c.Box.Top - lastLine[j].Bottom;
                if (gap < -2 || gap > Math.Max(4, a.LineH * 0.8)) continue;
                if (Math.Abs(c.Box.Left - a.Box.Left) > Math.Max(6, a.LineH)) continue;
                if (c.LineH * 4 < a.LineH * 3 || c.LineH * 3 > a.LineH * 4) continue;
                if (Continues(a.Text, c.Text)) k = j;
            }
            if (k < 0) { merged.Add(c); lastLine.Add(c.Box); continue; }
            merged[k].Text += " " + c.Text;
            merged[k].Box = Rectangle.Union(merged[k].Box, c.Box);
            merged[k].Lines++;
            lastLine[k] = c.Box;
        }
        return merged;
    }

    static bool Continues(string a, string b)
    {
        return Regex.IsMatch(b, "^[a-z]") || Regex.IsMatch(a, "[,\\-]$")
            || Regex.IsMatch(a, "\\b(the|a|an|to|of|and|or|in|for|with|on|your|is|are|be|by|from|that|this)$", RegexOptions.IgnoreCase);
    }

    // 바탕색 = 글줄 둘레에서 가장 많은 색, 글자색 = 글줄 안에서 바탕과 가장 다른 색들의 평균.
    static void Colors(int[] px, int w, int h, TextChunk c)
    {
        Rectangle ring = Rectangle.Inflate(c.Box, 3, 3);
        ring.Intersect(new Rectangle(0, 0, w, h));
        Dictionary<int, long[]> votes = new Dictionary<int, long[]>();
        long[] best = null;
        for (int i = 0; i < 2 * (ring.Width + ring.Height); i++)
        {
            int x, y;
            if (i < ring.Width) { x = ring.Left + i; y = ring.Top; }
            else if (i < 2 * ring.Width) { x = ring.Left + i - ring.Width; y = ring.Bottom - 1; }
            else if (i < 2 * ring.Width + ring.Height) { x = ring.Left; y = ring.Top + i - 2 * ring.Width; }
            else { x = ring.Right - 1; y = ring.Top + i - 2 * ring.Width - ring.Height; }
            int p = px[y * w + x];
            int key = (((p >> 16) & 255) >> 4) << 8 | (((p >> 8) & 255) >> 4) << 4 | ((p & 255) >> 4);
            long[] v;
            if (!votes.TryGetValue(key, out v)) votes[key] = v = new long[4];
            v[0]++; v[1] += (p >> 16) & 255; v[2] += (p >> 8) & 255; v[3] += p & 255;
            if (best == null || v[0] > best[0]) best = v;
        }
        c.Bg = Color.FromArgb((int)(best[1] / best[0]), (int)(best[2] / best[0]), (int)(best[3] / best[0]));
        int bg = c.Bg.ToArgb(), maxD = 0;
        for (int y = c.Box.Top; y < c.Box.Bottom; y++)
            for (int x = c.Box.Left; x < c.Box.Right; x++)
                maxD = Math.Max(maxD, Chat.Dist(px[y * w + x], bg));
        if (maxD < 60)
        {
            c.Fg = Luma(bg) > 128 ? Color.Black : Color.White;
            return;
        }
        long n = 0, R = 0, G = 0, B = 0;
        for (int y = c.Box.Top; y < c.Box.Bottom; y++)
            for (int x = c.Box.Left; x < c.Box.Right; x++)
            {
                int p = px[y * w + x];
                if (Chat.Dist(p, bg) * 10 < maxD * 7) continue;
                n++; R += (p >> 16) & 255; G += (p >> 8) & 255; B += p & 255;
            }
        c.Fg = Color.FromArgb((int)(R / n), (int)(G / n), (int)(B / n));
    }

    // ---- 옮기기 ----

    // 아직 모르는 글줄만 엔진에 묻는다. 다시 읽을 때 쓰라고 글줄마다 흰 바탕 검은 글자로 세 배 키운 그림을 같이 준다.
    static int Translate(List<TextChunk> chunks, int[] px, int w, int h)
    {
        List<TextChunk> ask = new List<TextChunk>();
        HashSet<string> asking = new HashSet<string>();
        lock (done)
        {
            foreach (TextChunk c in chunks)
            {
                string ko;
                if (done.TryGetValue(c.Text, out ko)) c.Ko = ko;
                else if (!TwoLatin.IsMatch(c.Text)) c.Ko = "";
                else if (asking.Add(c.Text)) ask.Add(c);
            }
        }
        for (int i = 0; i < ask.Count; i += 60)
        {
            List<TextChunk> part = ask.GetRange(i, Math.Min(60, ask.Count - i));
            List<Dictionary<string, object>> items = new List<Dictionary<string, object>>();
            foreach (TextChunk c in part)
            {
                Dictionary<string, object> it = new Dictionary<string, object>();
                it["t"] = c.Text;
                it["f"] = SaveCrop(px, w, h, c);
                it["n"] = c.Lines;
                items.Add(it);
            }
            string[] r = engine.Call("screen", "", json.Serialize(items), 60000);
            object[] outs = (object[])json.DeserializeObject(r[0]);
            lock (done)
            {
                if (done.Count > 5000) done.Clear();
                for (int k = 0; k < part.Count && k < outs.Length; k++)
                {
                    Dictionary<string, object> d = (Dictionary<string, object>)outs[k];
                    done[part[k].Text] = d.ContainsKey("k") && d["k"] != null ? d["k"].ToString() : "";
                    if (App.Debugging) Log.Write("화면 글줄 [" + part[k].Text + "] → [" + d["s"] + "] → [" + done[part[k].Text] + "]");
                }
            }
        }
        lock (done)
        {
            foreach (TextChunk c in chunks)
            {
                if (c.Ko != null) continue;
                string ko;
                c.Ko = done.TryGetValue(c.Text, out ko) ? ko : "";
            }
        }
        return ask.Count;
    }

    // 밝기를 늘여 바탕 → 흰색, 글자 → 검은색(어두운 테마도 같게). 밝기가 비슷하면 바탕과의 색 차이로.
    static string SaveCrop(int[] px, int w, int h, TextChunk c)
    {
        Rectangle r = Rectangle.Inflate(c.Box, 4, 4);
        r.Intersect(new Rectangle(0, 0, w, h));
        int bg = c.Bg.ToArgb(), lb = Luma(bg), lf = Luma(c.Fg.ToArgb()), maxD = 1;
        for (int y = r.Top; y < r.Bottom; y++)
            for (int x = r.Left; x < r.Right; x++) maxD = Math.Max(maxD, Chat.Dist(px[y * w + x], bg));
        int[] g = new int[r.Width * r.Height];
        for (int y = 0; y < r.Height; y++)
            for (int x = 0; x < r.Width; x++)
            {
                int p = px[(r.Top + y) * w + r.Left + x];
                int v = Math.Abs(lb - lf) >= 40 ? (Luma(p) - lf) * 255 / (lb - lf) : 255 - Chat.Dist(p, bg) * 255 / maxD;
                v = Math.Max(0, Math.Min(255, v));
                g[y * r.Width + x] = unchecked((int)0xFF000000) | v << 16 | v << 8 | v;
            }
        string dir = Path.Combine(dataDir, "ocr");
        Directory.CreateDirectory(dir);
        string file = Path.Combine(dir, "screen-" + (cropNo++ % 200) + ".png");
        using (Bitmap small = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb))
        {
            BitmapData d = small.LockBits(new Rectangle(0, 0, r.Width, r.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            Marshal.Copy(g, 0, d.Scan0, g.Length);
            small.UnlockBits(d);
            using (Bitmap big = new Bitmap(r.Width * 3, r.Height * 3, PixelFormat.Format32bppArgb))
            {
                using (Graphics gr = Graphics.FromImage(big))
                {
                    gr.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    gr.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    gr.DrawImage(small, 0, 0, big.Width, big.Height);
                }
                big.Save(file, ImageFormat.Png);
            }
        }
        return file;
    }

    // ---- 그리기 ----

    // 글줄 자리를 바탕색으로 덮고 한국어를 쓴다. 한 줄은 오른쪽 빈자리까지 넓히고, 그래도 넘치면 글씨를 조금(75%까지)
    // 줄인다. 문단은 그 너비 안에서 띄어쓰기마다 줄을 바꾼다.
    static Bitmap Draw(Size size, List<TextChunk> chunks)
    {
        Bitmap bmp = new Bitmap(size.Width, size.Height, PixelFormat.Format32bppArgb);
        Rectangle all = new Rectangle(Point.Empty, size);
        using (Graphics g = Graphics.FromImage(bmp))
        using (StringFormat one = new StringFormat(StringFormat.GenericTypographic))
        using (StringFormat many = new StringFormat(StringFormat.GenericTypographic))
        {
            one.FormatFlags |= StringFormatFlags.NoWrap;
            g.Clear(Color.Transparent);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            foreach (TextChunk c in chunks)
            {
                if (string.IsNullOrEmpty(c.Ko)) continue;
                Rectangle b = Rectangle.Inflate(c.Box, 2, 2);
                bool multi = c.Lines > 1;
                StringFormat sf = multi ? many : one;
                // 한 줄은 오른쪽 빈 바탕(다음 글줄·아이콘 앞)까지는 넓혀 써도 된다 — 그 안에 들어가면 줄이지 않는다.
                int room = c.Right;
                foreach (TextChunk o in chunks)
                    if (o != c && o.Box.Left >= c.Box.Right && o.Box.Top < c.Box.Bottom && o.Box.Bottom > c.Box.Top) room = Math.Min(room, o.Box.Left - 4);
                room = Math.Max(b.Width, room - b.X);
                float em = Math.Max(10f, Math.Min(48f, c.Em)), min = Math.Max(10f, em * (multi ? 0.7f : 0.75f));
                Font f;
                SizeF need;
                string text = c.Ko;
                while (true)
                {
                    f = new Font("Malgun Gothic", em, GraphicsUnit.Pixel);
                    if (multi) text = Wrap(g, c.Ko, f, b.Width, sf);
                    need = g.MeasureString(text, f, PointF.Empty, sf);
                    if ((multi ? need.Height <= b.Height + 2 : need.Width <= room) || em <= min) break;
                    f.Dispose();
                    em -= 1f;
                }
                Rectangle cover = b;
                int nh = (int)Math.Ceiling(need.Height) + 2;
                if (!multi)
                {
                    cover.Width = Math.Max(b.Width, (int)Math.Ceiling(need.Width) + 6);
                    if (nh > b.Height) { cover.Y -= (nh - b.Height) / 2; cover.Height = nh; }
                }
                else if (nh > b.Height) cover.Height = nh;
                cover.Intersect(all);
                using (SolidBrush bg = new SolidBrush(c.Bg)) g.FillRectangle(bg, cover);
                float ty = multi ? b.Y + 1 : cover.Y + (cover.Height - need.Height) / 2f;
                RectangleF tr = new RectangleF(b.X + 2, ty, need.Width + 4, need.Height + 2);
                using (SolidBrush fg = new SolidBrush(c.Fg)) g.DrawString(text, f, fg, tr, sf);
                f.Dispose();
            }
        }
        return bmp;
    }

    // 한국어는 띄어쓰기에서 줄을 바꾼다(GDI+ 는 낱말 가운데서도 끊는다: 언제든 / 지).
    static string Wrap(Graphics g, string text, Font f, int width, StringFormat sf)
    {
        StringBuilder all = new StringBuilder();
        string line = "";
        foreach (string w in text.Split(' '))
        {
            string next = line.Length == 0 ? w : line + " " + w;
            if (line.Length > 0 && g.MeasureString(next, f, PointF.Empty, sf).Width > width)
            {
                all.Append(line).Append('\n');
                line = w;
            }
            else line = next;
        }
        return all.Append(line).ToString();
    }

    static void ShowOverlay(IntPtr win, Rectangle r, List<TextChunk> chunks, int g)
    {
        if (chunks == null) return;
        Bitmap bmp = Draw(r.Size, chunks);
        if (App.Debugging)
        {
            try
            {
                bmp.Save(Path.Combine(dataDir, "screen-overlay.png"));
                StringBuilder s = new StringBuilder(r + "\r\n");
                foreach (TextChunk c in chunks) s.Append(c.Box).Append(" h").Append(c.LineH).Append(" em").Append(c.Em.ToString("0.0")).Append(" x").Append(c.Lines).Append(" [").Append(c.Text).Append("] → [").Append(c.Ko).Append("]\r\n");
                File.WriteAllText(Path.Combine(dataDir, "screen.txt"), s.ToString(), Encoding.UTF8);
            }
            catch { }
        }
        ui.BeginInvoke((MethodInvoker)delegate
        {
            try
            {
                if (g != gen || target != win) return;
                if (overlay.IsDisposed) overlay = new ScreenOverlay();
                overlay.Put(win, r, bmp);
            }
            catch (Exception e)
            {
                Log.Write("화면 번역 겹침 창 오류: " + e.Message);
                overlay = new ScreenOverlay();
            }
            finally { bmp.Dispose(); }
        });
    }

    static void HideOverlay()
    {
        ui.BeginInvoke((MethodInvoker)delegate { if (!overlay.IsDisposed && overlay.Visible) overlay.Hide(); });
    }
}
