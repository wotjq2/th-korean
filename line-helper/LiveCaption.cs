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
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
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
    // 크롬 '실시간 번역' 이 덜 들린 말에 붙이는 괄호 설명 — '(문장이 불완전합니다).', '(아마도 … 것 같습니다)',
    // '(나머지 텍스트는 …)' 가 영상 위에 그대로 떴다(2026-11-02·03). 설명에 드는 낱말은 config.json helper.liveTranslate.notes.
    // 크롬이 줄을 바꿔 두 줄에 걸친 괄호도, 아직 받아 적는 마지막 줄의 닫히지 않은 괄호도 지운다.
    static Regex notes;
    static DateTime notesAt = DateTime.MinValue;

    public static string StripNotes(string text)
    {
        if (notes == null || (DateTime.Now - notesAt).TotalSeconds > 60)
        {
            List<string> w = new List<string>();
            foreach (string s in RemoteConfig.CaptionNoteWords()) w.Add(Regex.Escape(s));
            string any = "(?:" + string.Join("|", w.ToArray()) + ")";
            notes = new Regex("\\s*[(（](?:[^()（）]*" + any + "[^()（）]*[)）]\\.?|[^()（）\\n]*" + any + "[^()（）\\n]*$)", RegexOptions.IgnoreCase);
            notesAt = DateTime.Now;
        }
        return notes.Replace(text, "");
    }

    // UI 스레드에서 부른다(덮개 창을 그 스레드에 만든다).
    public static void Start(Engine e)
    {
        engine = e;
        cover = new CaptionCover();
        IntPtr force = cover.Handle;
        new Thread(Loop) { IsBackground = true }.Start();
        new Thread(Serve) { IsBackground = true }.Start();
    }

    // ---- 확장에 내주기 ----
    // 사용자(2026-11-01, 페이스북 릴스): 크롬 자막 창 대신 유튜브처럼 영상 위에 자막으로. 크롬 확장은 이 도우미에게
    // 먼저 말을 걸 수 없어서(네이티브 메시징은 확장이 부를 때만), 이 PC 안에서만 열리는 통로(127.0.0.1:38291)에
    // 지금 한국어 자막을 놓아 두고, 영상이 재생 중인 탭의 확장이 0.7초마다 가져가 그 영상 위에 띄운다.
    // 확장이 가져가는 동안에는 크롬 자막 창을 화면 밖으로 치운다(Tuck). 내주는 것은 자막 글자뿐이다(명령은 받지 않는다).
    // 확장은 자막을 꺼 두었거나 자기 자막(자막 파일)을 띄우는 영상에서도 묻는다 — 그때도 크롬 자막 창은 치워 둔다.
    public const int Port = 38291;
    static string latest = "";
    static DateTime latestAt = DateTime.Now;
    static DateTime lastPolled = DateTime.MinValue;
    static DateTime koreanAt = DateTime.MinValue; // 크롬이 받아 적은 말이 한국어라 비워 둔 마지막 때

    static void Publish(string text)
    {
        lock (lk)
        {
            if (text == latest) return;
            latest = text;
            latestAt = DateTime.Now;
        }
    }

    static void Serve()
    {
        System.Net.Sockets.TcpListener l;
        try
        {
            l = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, Port);
            l.Start();
        }
        catch (Exception e) { Log.Write("실시간 자막: 확장에 내줄 통로를 못 열었습니다 — " + e.Message); return; }
        System.Web.Script.Serialization.JavaScriptSerializer json = new System.Web.Script.Serialization.JavaScriptSerializer();
        while (true)
        {
            try
            {
                using (System.Net.Sockets.TcpClient c = l.AcceptTcpClient())
                {
                    c.ReceiveTimeout = 1000;
                    c.SendTimeout = 1000;
                    System.IO.Stream s = c.GetStream();
                    byte[] req = new byte[2048];
                    s.Read(req, 0, req.Length); // GET /caption — 무엇을 물어도 같은 답
                    Dictionary<string, object> d = new Dictionary<string, object>();
                    lock (lk)
                    {
                        d["on"] = On;
                        d["text"] = latest;
                        d["age"] = (int)(DateTime.Now - latestAt).TotalMilliseconds;
                    }
                    d["cc"] = ChromeCc();
                    d["ccLang"] = ccLang;
                    d["ccTr"] = ccTr;
                    d["ko"] = latest.Length == 0 && (DateTime.Now - koreanAt).TotalSeconds < 6;
                    d["dead"] = dead;
                    lastPolled = DateTime.Now;
                    byte[] body = System.Text.Encoding.UTF8.GetBytes(json.Serialize(d));
                    byte[] head = System.Text.Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n"
                        + "Access-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: " + body.Length + "\r\n\r\n");
                    s.Write(head, 0, head.Length);
                    s.Write(body, 0, body.Length);
                }
            }
            catch (Exception) { /* 끊긴 연결 */ }
        }
    }

    // 크롬 설정의 '실시간 자막' 이 켜져 있는가("on"/"off", 모르면 ""). 꺼져 있으면 옮길 글자가 없다 — 사용자
    // (2026-11-01)가 설정 화면에서 그 스위치를 끈 채 '번역 자막이 없다' 고 했다. 확장이 영상 위·창에 알린다.
    // 마지막으로 쓴 프로필의 Preferences 를, 파일이 바뀌었을 때만 다시 읽는다(키가 없으면 기본값 = 꺼짐).
    static string ccState = "";
    static string ccLang = ""; // 크롬이 받아 적는 언어(ko-KR, th-TH …) — 영상 언어와 다르면 엉뚱한 글자가 나온다
    static bool ccTr; // 크롬 '자막 번역' — 켜 두면 크롬이 먼저 옮겨 단어집이 쓰이지 않는다
    static DateTime ccChecked = DateTime.MinValue;
    static DateTime ccFileTime = DateTime.MinValue;
    static string ccFile = "";
    static DateTime stateTime = DateTime.MinValue;

    static string ChromeCc()
    {
        if ((DateTime.Now - ccChecked).TotalMilliseconds < 2000) return ccState;
        ccChecked = DateTime.Now;
        try
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google\\Chrome\\User Data");
            string localState = Path.Combine(root, "Local State");
            if (!File.Exists(localState)) return ccState = "";
            DateTime lt = File.GetLastWriteTime(localState);
            if (lt != stateTime || ccFile.Length == 0)
            {
                stateTime = lt;
                Match p = Regex.Match(File.ReadAllText(localState), "\"last_used\":\"([^\"]+)\"");
                ccFile = Path.Combine(root, p.Success ? Regex.Unescape(p.Groups[1].Value) : "Default", "Preferences");
                ccFileTime = DateTime.MinValue;
            }
            if (!File.Exists(ccFile)) return ccState = "";
            DateTime ft = File.GetLastWriteTime(ccFile);
            if (ft == ccFileTime) return ccState;
            ccFileTime = ft;
            string text;
            using (FileStream f = new FileStream(ccFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (StreamReader r = new StreamReader(f, System.Text.Encoding.UTF8))
                text = r.ReadToEnd();
            ccState = Regex.IsMatch(text, "\"live_caption_enabled\":\\s*true") ? "on" : "off";
            Match lang = Regex.Match(text, "\"live_caption_language\":\\s*\"([^\"]+)\"");
            ccLang = lang.Success ? lang.Groups[1].Value : "en-US"; // 크롬 기본값
            ccTr = Regex.IsMatch(text, "\"live_translate_enabled\":\\s*true");
        }
        catch (Exception) { ccFileTime = DateTime.MinValue; } // 크롬이 쓰는 중 — 다음에 다시
        return ccState;
    }

    // ---- 크롬 자막 창 치우기 ----
    // 사용자(2026-11-02, 쇼츠·페이스북): 크롬 자막 창(검은 상자)이 댓글·영상을 가리고 한국어 영상에도 떠서 불편하다.
    // 한국어는 확장이 영상 위에 유튜브 자막처럼 띄우므로, 확장이 10분 안에 물어 왔으면 그 창을 화면 아래 밖으로
    // 옮겨 둔다. 창은 살아 있어 UI Automation 으로 계속 읽힌다(2026-11-02 시험 크롬: 옮긴 뒤 크롬이 되돌리지 않음).
    // 크롬이 다시 화면에 놓으면 다음 Tick 에 또 치운다. 확장이 오래 안 묻거나, 도우미에서 끄거나, 도우미를 끝내면
    // 제자리로 돌려놓는다. 확장 없이 도우미만 쓰면 예전처럼 자막 창 위를 한국어로 덮는다.
    const int TuckMinutes = 10;
    static IntPtr bubble = IntPtr.Zero;
    static Native.RECT home;
    static bool haveHome, stopping;
    static readonly DateTime startedAt = DateTime.Now;

    static bool WantTuck() { return On && !stopping && (DateTime.Now - lastPolled).TotalMinutes < TuckMinutes; }

    static bool OnScreen(Native.RECT r)
    {
        Rectangle w = Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
        foreach (Screen s in Screen.AllScreens) if (s.Bounds.IntersectsWith(w)) return true;
        return false;
    }

    static void Tuck()
    {
        Native.RECT r;
        if (bubble == IntPtr.Zero || !Native.GetWindowRect(bubble, out r) || !OnScreen(r)) return;
        home = r;
        haveHome = true;
        Native.SetWindowPos(bubble, IntPtr.Zero, r.Left, SystemInformation.VirtualScreen.Bottom + 200, 0, 0,
            Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
    }

    static void Untuck()
    {
        Native.RECT r;
        if (bubble == IntPtr.Zero || !Native.GetWindowRect(bubble, out r) || OnScreen(r)) return;
        // 치운 자리를 모르면(도우미가 치운 채 꺼졌다 켜짐) 확장이 다시 물을 틈을 준 뒤 주 화면 아래 가운데로.
        if (!haveHome && (DateTime.Now - startedAt).TotalSeconds < 5) return;
        Point to;
        if (haveHome) to = new Point(home.Left, home.Top);
        else
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            to = new Point(wa.Left + (wa.Width - (r.Right - r.Left)) / 2, wa.Bottom - (r.Bottom - r.Top) - 40);
        }
        Native.SetWindowPos(bubble, IntPtr.Zero, to.X, to.Y, 0, 0, Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
    }

    // 도우미를 끝낼 때(UI 스레드) 치운 자막 창을 돌려놓는다.
    public static void Stop()
    {
        stopping = true;
        try { Untuck(); } catch (Exception) { }
    }

    static void Loop()
    {
        while (true)
        {
            int wait = 350;
            try { wait = Tick(); }
            catch (Exception) { label = null; Publish(""); Hide(); } // 자막 창이 닫혔다
            Thread.Sleep(wait);
        }
    }

    // 다음 볼 때까지 쉴 시간(ms)을 돌려준다. 자막 창이 없으면 천천히 찾는다.
    static int Tick()
    {
        if (stopping) return 1000;
        if (!On) { Untuck(); Publish(""); Hide(); return 1000; }
        if (label == null) label = Find();
        if (label == null) { Publish(""); Hide(); CheckDead(); return 1500; }
        dead = false;
        missingSince = DateTime.MinValue;
        bool tuck = WantTuck();
        if (tuck) Tuck(); else Untuck();
        System.Windows.Rect b = label.Current.BoundingRectangle;
        // 크롬이 자막 창을 내렸다(말이 없음). 치워 둔 창은 화면 밖이라 글자 칸 크기 대신 창이 보이는지로 본다.
        if (tuck ? !Native.IsWindowVisible(bubble) : b.IsEmpty || b.Width < 30 || b.Height < 10) { Hide(); return 500; }
        if (!seen) { seen = true; Log.Write("실시간 자막: 크롬 자막 창을 찾음 — 한국어로 옮깁니다"); }
        List<bool> glued = new List<bool>();
        List<string> lines = Lines(label, glued);
        if (lines.Count == 0) { Publish(""); Hide(); return 350; }
        string all = string.Join(" ", lines.ToArray());
        // 한국어 영상 — 크롬 '자막 번역' 을 꺼 두면 받아 적은 글자에 한글이 있을 때는 한국어 말뿐이다(태국어·영어 말은
        // 한글로 적히지 않는다). 띄우지 않는다(사용자 2026-11-02: 한국 영상에도 자막이 떠서 불편). 자막 번역을 켜 두면
        // 외국어 영상도 한국어로 와서 가려낼 수 없다.
        if (!ccTr && Hangul.IsMatch(all)) { koreanAt = DateTime.Now; Publish(""); Hide(); return 350; }
        // 크롬 '자막 번역' 으로 모두 한국어면 옮길 것 없이 그대로 내준다.
        bool allKorean = Hangul.IsMatch(all) && !Foreign.IsMatch(all);
        for (int i = 0; i < lines.Count && !allKorean; i++)
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
        // 크롬은 자막 창 너비에서 줄을 바꿔 한국어 낱말이 두 줄로 갈린다(2026-11-02 사용자 크롬: '오토 / 바이', '설 / 치가').
        // 그대로 이어 붙이면 영상 위에 '오토 바이' 로 나오니, 낱말 가운데서 갈린 한국어 줄은 앞 줄에 바로 붙인다.
        List<string> ko = new List<string>();
        lock (lk)
        {
            for (int i = 0; i < lines.Count; i++)
            {
                string k = lines[i];
                if (!allKorean && (!done.TryGetValue(lines[i], out k) || k.Length == 0)) continue;
                k = k.Trim();
                if (k.Length == 0) continue;
                if (glued[i] && ko.Count > 0 && Hangul.IsMatch(lines[i]) && Hangul.IsMatch(lines[i - 1])) ko[ko.Count - 1] += k;
                else ko.Add(k);
            }
        }
        string shown = StripNotes(string.Join("\n", ko.ToArray()));
        ko = new List<string>();
        foreach (string s in shown.Split('\n')) if (s.Trim().Length > 0) ko.Add(s.Trim());
        Publish(string.Join("\n", ko.ToArray()));
        // 확장이 이 한국어를 받아 영상 위에 띄우고 있으면 크롬 자막 창은 치워 두었으니 덮지 않는다.
        if (ko.Count == 0 || allKorean || WantTuck()) { Hide(); return 350; }
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
            if (found != null) { bubble = (IntPtr)w.Current.NativeWindowHandle; return found; }
        }
        return null;
    }

    // ---- 크롬 자막 창이 닫혀 실시간 자막이 멈춤 ----
    // 2026-11-03 사용자 크롬: 아침에 되던 실시간 자막이 어느새 어떤 영상에서도 안 나왔다. 크롬은 '실시간 자막' 이 켜져
    // 있으면 시작할 때 자막 창(숨은 창, 주인 창 없음)을 한 번 만들어 두는데, 그 창이 없어져 있었고 소리가 나도 받아 적지
    // 않았다. 시험 크롬(2026-11-04): 그 창을 닫으면 다시 생기지 않고, 설정의 '실시간 자막' 을 껐다 켜면 새로 생긴다.
    // 확장이 묻는 동안 5초마다 숨은 창까지 뒤져, 자막 글자 칸이 든 크롬 창이 하나도 없으면(크롬이 켜진 지 30초, 없어진 지
    // 15초가 지나면) 확장에 dead 로 알린다 — 확장이 '크롬 실시간 자막 고치기'(ChromeLink cc-reset)를 내민다.
    static volatile bool dead;
    static DateTime missingSince = DateTime.MinValue;
    static DateTime deadChecked = DateTime.MinValue;

    static void CheckDead()
    {
        if ((DateTime.Now - deadChecked).TotalSeconds < 5 || (DateTime.Now - lastPolled).TotalSeconds > 60) return;
        deadChecked = DateTime.Now;
        List<int> pids = ChromePids();
        if (ccState != "on" || pids == null || !SodaReady() || CaptionWindowExists(pids))
        {
            if (dead) Log.Write("실시간 자막: 크롬 자막 창이 다시 생겼습니다");
            dead = false;
            missingSince = DateTime.MinValue;
            return;
        }
        if (missingSince == DateTime.MinValue) missingSince = DateTime.Now;
        if (dead || (DateTime.Now - missingSince).TotalSeconds < 15) return;
        dead = true;
        Log.Write("실시간 자막: 크롬 자막 창이 없습니다 — 크롬이 받아 적지 않습니다(설정의 '실시간 자막' 을 껐다 켜면 되살아남)");
    }

    // 켜져 있는 크롬 프로세스들. 크롬이 켜진 지 30초가 안 됐으면(자막 창을 만들 틈) 또는 크롬이 없으면 null.
    static List<int> ChromePids()
    {
        List<int> ids = new List<int>();
        DateTime first = DateTime.MaxValue;
        foreach (Process p in Process.GetProcessesByName("chrome"))
        {
            try { if (p.StartTime < first) first = p.StartTime; } catch (Exception) { }
            ids.Add(p.Id);
            p.Dispose();
        }
        return ids.Count == 0 || (DateTime.Now - first).TotalSeconds < 30 ? null : ids;
    }

    // 크롬은 받아 적는 언어 꾸러미를 다 받기 전에는 자막 창을 만들지 않는다 — 막 켠 사람에게 '멈춤' 이라 하지 않게.
    static bool SodaReady()
    {
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google\\Chrome\\User Data");
        string soda = Path.Combine(root, "SODA");
        return Directory.Exists(soda) && Directory.GetDirectories(soda).Length > 0
            && Directory.Exists(Path.Combine(root, "SODALanguagePacks", ccLang.Length > 0 ? ccLang : "en-US"));
    }

    // 크롬의 주인 없는 창(숨은 것까지) 가운데 자막 글자 칸이 든 것이 있는가. 숨은 자막 창도 UI Automation 으로 글자 칸이
    // 보인다(2026-11-04 사용자 크롬, 70ms). 이름이 있는 창만 본다(크롬의 이름 없는 숨은 창은 많다).
    static bool CaptionWindowExists(List<int> pids)
    {
        List<IntPtr> wins = new List<IntPtr>();
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            uint pid;
            Native.GetWindowThreadProcessId(h, out pid);
            if (!pids.Contains((int)pid) || Native.GetWindow(h, 4) != IntPtr.Zero || GetWindowTextLength(h) == 0) return true; // 4 = GW_OWNER
            StringBuilder c = new StringBuilder(32);
            GetClassName(h, c, c.Capacity);
            if (c.ToString() == "Chrome_WidgetWin_1") wins.Add(h);
            return true;
        }, IntPtr.Zero);
        PropertyCondition cap = new PropertyCondition(AutomationElement.ClassNameProperty, "CaptionBubbleLabel");
        foreach (IntPtr h in wins)
        {
            // 보이는 큰 창(브라우저)은 건너뛴다 — 보이는 자막 창은 Find 가 이미 찾는다.
            Native.RECT r;
            if (Native.IsWindowVisible(h) && Native.GetWindowRect(h, out r) && (r.Right - r.Left > 1400 || r.Bottom - r.Top > 900)) continue;
            try { if (AutomationElement.FromHandle(h).FindFirst(TreeScope.Descendants, cap) != null) return true; }
            catch (Exception) { }
        }
        return false;
    }

    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);

    // 보이는 줄마다 한 칸. glued[i] = 앞 줄 끝에 빈칸이 없다(크롬이 낱말 가운데서 줄을 바꿨다 — 낱말 사이에서
    // 바꾼 줄은 끝에 빈칸이 남는다).
    static List<string> Lines(AutomationElement lab, List<bool> glued)
    {
        List<string> list = new List<string>();
        bool open = false;
        foreach (AutomationElement k in lab.FindAll(TreeScope.Children, Condition.TrueCondition))
        {
            string n = k.Current.Name;
            if (string.IsNullOrEmpty(n) || n.Trim().Length == 0) continue;
            list.Add(n.Trim());
            glued.Add(open);
            open = !char.IsWhiteSpace(n[n.Length - 1]);
        }
        if (list.Count == 0)
        {
            string n = lab.Current.Name;
            if (!string.IsNullOrEmpty(n) && n.Trim().Length > 0) { list.Add(n.Trim()); glued.Add(false); }
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
