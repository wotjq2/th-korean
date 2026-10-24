// 번역 도우미(번역도우미.exe, 예전 이름 LINE 도우미) — 태국 사이트 한국어 스크립트를 크롬 밖 프로그램에 옮긴 것.
// LINE PC 는 웹페이지가 아니라 Qt 프로그램이라 스크립트가 들어갈 수 없다. 그래서 이 프로그램이 대신
//  - 보내기: LINE 입력칸 위의 막대(태·미·중·일·러·이·폴)에서 언어를 고르면, 한국어를 쓰고 Enter 한 번에
//    그 언어로 바꿔 붙여 넣고 보낸다. 고른 언어는 끌 때까지 유지된다(크롬 막대와 같다).
//  - 받기: LINE 에서 태국어 메시지를 복사하면 마우스 옆에 한국어를 띄운다. LINE 은 메시지 글자를
//    다른 프로그램에 보여 주지 않아(접근성 이름이 비어 있다, 2026-10-24 확인) 메신저처럼 저절로 달 수는 없다.
//  - 화면 번역(ScreenKorean.cs): 아무 프로그램 창이든 Ctrl+Alt+K 로 영어 글자를 그 자리에 한국어로 덮는다.
//  - 업데이트(Updater.cs): GitHub 의 새 판을 스스로 받아 바꾼다. 처음 설치는 install.ps1(명령 한 줄).
// 번역은 engine.js(node)가 th-korean.user.js 를 그대로 불러 메신저와 같은 길로 한다.
// 빌드: build.cmd (윈도우에 들어 있는 .NET Framework 4 csc, C# 5 문법).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;
using Microsoft.Win32;

// 작업 관리자에 보이는 이름.
[assembly: System.Reflection.AssemblyTitle("번역 도우미")]
[assembly: System.Reflection.AssemblyProduct("번역 도우미")]

static class Native
{
    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public InputUnion u; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] public static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] public static extern bool AddClipboardFormatListener(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool RemoveClipboardFormatListener(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool MessageBeep(uint type);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    public const int GWL_EXSTYLE = -20;
    public const uint SWP_NOSIZE = 1, SWP_NOMOVE = 2, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    public const int SW_SHOWNOACTIVATE = 4;
    public static readonly IntPtr HWND_TOPMOST = (IntPtr)(-1), HWND_NOTOPMOST = (IntPtr)(-2);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int W, H; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UpdateLayeredWindow(IntPtr hWnd, IntPtr dst, ref POINT pt, ref SIZE size, IntPtr src, ref POINT srcPt, int key, ref BLENDFUNCTION blend, int flags);
    public const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, ULW_ALPHA = 2, GWLP_HWNDPARENT = -8;
    public const uint PW_RENDERFULLCONTENT = 2;

    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
    public const int WM_CLIPBOARDUPDATE = 0x031D, WM_MOUSEACTIVATE = 0x21, MA_NOACTIVATE = 3;
    public const int WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000;
    public const ushort VK_RETURN = 0x0D, VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_RIGHT = 0x27;
    public const ushort VK_LWIN = 0x5B, VK_RWIN = 0x5C;
    public const uint KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2;
    public const uint GA_ROOT = 2;

    // 이 프로그램이 보낸 키 표시. 훅이 자기 키를 다시 가로채지 않게 한다.
    public static readonly IntPtr MARK = (IntPtr)0x4C494E45;

    static INPUT Key(ushort vk, bool up, bool ext)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.u.ki.wVk = vk;
        i.u.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (ext ? KEYEVENTF_EXTENDEDKEY : 0);
        i.u.ki.dwExtraInfo = MARK;
        return i;
    }

    public static void Tap(ushort vk, bool ext)
    {
        INPUT[] a = { Key(vk, false, ext), Key(vk, true, ext) };
        SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Ctrl(ushort vk)
    {
        INPUT[] a = { Key(VK_CONTROL, false, false), Key(vk, false, false), Key(vk, true, false), Key(VK_CONTROL, true, false) };
        SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
    }

    public static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    public static Rectangle WindowRect(IntPtr h)
    {
        RECT r;
        if (!GetWindowRect(h, out r)) return Rectangle.Empty;
        return Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
    }
}

static class Log
{
    static readonly object Lock = new object();
    public static string FilePath;

    public static void Write(string msg)
    {
        try
        {
            lock (Lock)
            {
                FileInfo fi = new FileInfo(FilePath);
                if (fi.Exists && fi.Length > 2000000) File.Copy(FilePath, FilePath + ".old", true);
                if (fi.Exists && fi.Length > 2000000) File.Delete(FilePath);
                File.AppendAllText(FilePath, DateTime.Now.ToString("MM-dd HH:mm:ss.fff ") + msg + "\r\n", Encoding.UTF8);
            }
        }
        catch { }
    }
}

// node engine.js 와 한 줄씩 JSON 을 주고받는다. 죽으면 다음 요청 때 다시 띄운다.
class Engine
{
    readonly string dir;
    readonly object lk = new object();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Dictionary<int, TaskCompletionSource<Dictionary<string, object>>> waiting = new Dictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
    Process proc;
    StreamWriter stdin;
    int nextId;

    public Engine(string dir) { this.dir = dir; }

    public static string FindNode()
    {
        // install.ps1 이 Node.js 가 없는 PC 에 받아 둔 휴대용 Node 가 먼저.
        string mine = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "node", "node.exe");
        if (File.Exists(mine)) return mine;
        foreach (string p in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                string f = Path.Combine(p.Trim().Trim('"'), "node.exe");
                if (p.Trim().Length > 0 && File.Exists(f)) return f;
            }
            catch { }
        }
        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        return File.Exists(pf) ? pf : null;
    }

    void Start()
    {
        ProcessStartInfo psi = new ProcessStartInfo(FindNode(), "\"" + Path.Combine(dir, "engine.js") + "\"");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardInput = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.WorkingDirectory = dir;
        proc = Process.Start(psi);
        stdin = new StreamWriter(proc.StandardInput.BaseStream, new UTF8Encoding(false));
        stdin.AutoFlush = true;
        stdin.NewLine = "\n";
        Process p = proc;
        new Thread(delegate () { ReadLoop(p); }) { IsBackground = true }.Start();
        new Thread(delegate ()
        {
            string line;
            while ((line = p.StandardError.ReadLine()) != null) Log.Write("[엔진] " + line);
        }) { IsBackground = true }.Start();
        Log.Write("엔진 시작 (pid " + proc.Id + ")");
    }

    void ReadLoop(Process p)
    {
        string line;
        while ((line = p.StandardOutput.ReadLine()) != null)
        {
            try
            {
                Dictionary<string, object> d = json.Deserialize<Dictionary<string, object>>(line);
                int id = Convert.ToInt32(d["id"]);
                TaskCompletionSource<Dictionary<string, object>> t;
                lock (lk)
                {
                    if (!waiting.TryGetValue(id, out t)) continue;
                    waiting.Remove(id);
                }
                t.TrySetResult(d);
            }
            catch (Exception e) { Log.Write("엔진 답 해석 실패: " + e.Message); }
        }
        lock (lk)
        {
            foreach (TaskCompletionSource<Dictionary<string, object>> t in waiting.Values) t.TrySetException(new Exception("엔진이 꺼졌습니다"));
            waiting.Clear();
        }
    }

    // 성공하면 (결과, 방식), 실패하면 예외. 엔진은 스크립트 새 판이 올라오면 스스로 끝나므로(engine.js),
    // 그 틈에 걸린 요청은 엔진을 다시 띄워 한 번 더 보낸다.
    public string[] Call(string op, string lang, string text, int timeoutMs)
    {
        try { return CallOnce(op, lang, text, timeoutMs); }
        catch (Exception e)
        {
            if (!(e is IOException || e.Message == "엔진이 꺼졌습니다" || (e is AggregateException && e.InnerException != null && e.InnerException.Message == "엔진이 꺼졌습니다"))) throw;
            Log.Write("엔진 다시 띄워 한 번 더: " + e.Message);
            return CallOnce(op, lang, text, timeoutMs);
        }
    }

    string[] CallOnce(string op, string lang, string text, int timeoutMs)
    {
        TaskCompletionSource<Dictionary<string, object>> t = new TaskCompletionSource<Dictionary<string, object>>();
        lock (lk)
        {
            if (proc == null || proc.HasExited) Start();
            int id = ++nextId;
            waiting[id] = t;
            Dictionary<string, object> req = new Dictionary<string, object>();
            req["id"] = id;
            req["op"] = op;
            req["lang"] = lang;
            req["text"] = text;
            stdin.WriteLine(json.Serialize(req));
        }
        if (!t.Task.Wait(timeoutMs)) throw new Exception("번역이 너무 오래 걸립니다");
        Dictionary<string, object> d = t.Task.Result;
        if (!(d.ContainsKey("ok") && d["ok"] is bool && (bool)d["ok"])) throw new Exception(d.ContainsKey("err") ? d["err"].ToString() : "번역 실패");
        return new string[] { d["out"].ToString(), d.ContainsKey("via") ? d["via"].ToString() : "" };
    }

    public void Stop()
    {
        try { if (proc != null && !proc.HasExited) { stdin.Close(); if (!proc.WaitForExit(1500)) proc.Kill(); } } catch { }
    }
}

// 포커스를 빼앗지 않는 맨 위 창(막대·알림). WinForms 의 TopMost·Show() 는 창을 앞 창으로 만든다 —
// 보낸 뒤 알림이 LINE 의 앞 창 자리를 6초 동안 가져가 말풍선 읽기가 멈췄다(2026-10-24). 그래서 맨 위는
// 만들 때의 WS_EX_TOPMOST 로만 두고, 띄우기는 SWP_NOACTIVATE 로 한다.
class FloatForm : Form
{
    public FloatForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        DoubleBuffered = true;
    }

    // ShowWindow 로 띄워야 WinForms 의 Visible 도 따라온다(Hide 가 먹게).
    public void ShowAt(Rectangle r)
    {
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, r.X, r.Y, r.Width, r.Height, Native.SWP_NOACTIVATE);
        if (!Visible) Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_TOPMOST | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return cp;
        }
    }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_MOUSEACTIVATE) { m.Result = (IntPtr)Native.MA_NOACTIVATE; return; }
        base.WndProc(ref m);
    }
}

// LINE 입력칸 바로 위 오른쪽에 붙는 언어 막대. 고른 칸을 다시 누르면 끈다.
class LangBar : FloatForm
{
    public static readonly string[][] Langs = {
        new[] { "th", "태", "태국어" }, new[] { "en", "미", "영어" }, new[] { "zh", "중", "중국어" },
        new[] { "ja", "일", "일본어" }, new[] { "ru", "러", "러시아어" }, new[] { "he", "이", "히브리어" },
        new[] { "pl", "폴", "폴란드어" },
    };
    const int CellW = 26, CellH = 22, Gap = 5, BothW = 34;
    readonly Font font = new Font("Malgun Gothic", 9f, FontStyle.Bold);
    readonly ToolTip tip = new ToolTip();
    public bool Busy;
    int hover = -1;

    public LangBar()
    {
        ClientSize = new Size(CellW * Langs.Length + Gap + BothW + 2, CellH + 2);
        BackColor = Color.FromArgb(200, 200, 205);
        tip.ShowAlways = true;
        tip.SetToolTip(this, "언어를 고르면 LINE 에서 한국어를 쓰고 Enter 한 번에 그 언어로 바꿔 보냅니다.\n고른 칸을 다시 누르면 끕니다(한국어 그대로 보냄).\n+한: 바꾼 말 아래에 한국어 원문도 같이 보냅니다.");
    }

    // 마지막 칸(+한) = 바꾼 말과 한국어 원문을 같이 보내기.
    Rectangle BothRect { get { return new Rectangle(1 + CellW * Langs.Length + Gap, 1, BothW - 1, CellH); } }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        TextFormatFlags tf = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding;
        for (int i = 0; i < Langs.Length; i++)
        {
            Rectangle r = new Rectangle(1 + i * CellW, 1, CellW - 1, CellH);
            bool on = Langs[i][0] == App.Lang;
            Color bg = on ? (Busy ? Color.FromArgb(255, 152, 0) : Color.FromArgb(6, 199, 85)) : (i == hover ? Color.FromArgb(225, 228, 232) : Color.FromArgb(246, 247, 249));
            using (SolidBrush b = new SolidBrush(bg)) g.FillRectangle(b, r);
            TextRenderer.DrawText(g, Langs[i][1], font, r, on ? Color.White : Color.FromArgb(70, 70, 75), tf);
        }
        using (SolidBrush gap = new SolidBrush(Color.FromArgb(120, 120, 128)))
            g.FillRectangle(gap, 1 + CellW * Langs.Length - 1, 0, Gap + 1, Height);
        Rectangle br = BothRect;
        Color bbg = App.Both ? Color.FromArgb(33, 118, 255) : (hover == Langs.Length ? Color.FromArgb(225, 228, 232) : Color.FromArgb(246, 247, 249));
        using (SolidBrush b = new SolidBrush(bbg)) g.FillRectangle(b, br);
        TextRenderer.DrawText(g, "+한", font, br, App.Both ? Color.White : Color.FromArgb(70, 70, 75), tf);
    }

    int CellAt(Point p)
    {
        if (BothRect.Contains(p)) return Langs.Length;
        int i = (p.X - 1) / CellW;
        return p.X >= 1 && i >= 0 && i < Langs.Length ? i : -1;
    }

    protected override void OnMouseMove(MouseEventArgs e) { int h = CellAt(e.Location); if (h != hover) { hover = h; Invalidate(); } }
    protected override void OnMouseLeave(EventArgs e) { hover = -1; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        int i = CellAt(e.Location);
        if (i < 0 || e.Button != MouseButtons.Left) return;
        if (i == Langs.Length) App.SetBoth(!App.Both);
        else App.SetLang(Langs[i][0] == App.Lang ? "" : Langs[i][0]);
    }
}

// 짧게 떴다 사라지는 알림. 클릭하면 닫힌다.
class Note : FloatForm
{
    readonly System.Windows.Forms.Timer hide = new System.Windows.Forms.Timer();
    readonly Font small = new Font("Malgun Gothic", 9f);
    readonly Font big = new Font("Malgun Gothic", 11f, FontStyle.Bold);
    string top = "", main = "";
    Color edge = Color.FromArgb(6, 199, 85);
    const int Pad = 10, MaxW = 440;

    public Note()
    {
        BackColor = Color.White;
        hide.Tick += delegate { hide.Stop(); Hide(); };
    }

    // at: 알림을 붙일 점. above 면 그 점 위로, 아니면 아래로 띄운다.
    public void Pop(string topLine, string mainText, Point at, bool above, bool error, int ms)
    {
        top = topLine ?? "";
        main = mainText ?? "";
        edge = error ? Color.FromArgb(229, 57, 53) : Color.FromArgb(6, 199, 85);
        TextFormatFlags f = TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix;
        Size s1 = top.Length > 0 ? TextRenderer.MeasureText(top, small, new Size(MaxW, 0), f) : Size.Empty;
        Size s2 = TextRenderer.MeasureText(main, big, new Size(MaxW, 0), f);
        int w = Math.Max(s1.Width, s2.Width) + Pad * 2 + 4;
        int h = s1.Height + (top.Length > 0 ? 4 : 0) + s2.Height + Pad * 2;
        Rectangle wa = Screen.FromPoint(at).WorkingArea;
        int x = Math.Max(wa.Left, Math.Min(at.X, wa.Right - w));
        int y = above ? at.Y - h - 6 : at.Y + 18;
        if (y < wa.Top) y = at.Y + 18;
        if (y + h > wa.Bottom) y = Math.Max(wa.Top, at.Y - h - 6);
        ShowAt(new Rectangle(x, y, w, h));
        Invalidate();
        hide.Stop();
        hide.Interval = ms;
        hide.Start();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        using (Pen p = new Pen(edge, 2)) g.DrawRectangle(p, 1, 1, Width - 2, Height - 2);
        TextFormatFlags f = TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix;
        int y = Pad;
        if (top.Length > 0)
        {
            Size s1 = TextRenderer.MeasureText(top, small, new Size(MaxW, 0), f);
            TextRenderer.DrawText(g, top, small, new Rectangle(Pad + 2, y, MaxW, s1.Height), Color.FromArgb(110, 110, 115), f);
            y += s1.Height + 4;
        }
        TextRenderer.DrawText(g, main, big, new Rectangle(Pad + 2, y, MaxW, Height - y), Color.FromArgb(25, 25, 28), f);
    }

    protected override void OnMouseDown(MouseEventArgs e) { hide.Stop(); Hide(); }
}

// 대화창의 한 줄(말풍선 하나). 좌표는 화면 기준.
class Bubble
{
    public Rectangle Row, Box;
    public bool Mine;
    public int InkLeft, InkRight; // 줄 안에서 글자·시각·말풍선이 차지한 왼쪽·오른쪽 끝
    public string Hash;
    public Color Fill, Bg;
}

// 말풍선 하나를 읽고 옮긴 결과. 같은 말풍선(같은 그림)은 다시 읽지 않는다.
class Msg
{
    public bool Done;
    public string Thai = "", Ko = "", Mark = "";
    public DateTime FailedAt = DateTime.MinValue;
}

// 말풍선 옆에 붙일 한국어. Avail 은 비어 있는 자리, Drawn 은 실제로 그린 자리(그릴 때 정한다).
class Label
{
    public Rectangle Avail, Hover, Drawn;
    public string Text, Thai, Ko;
    public bool Mine, Cut;
}

// LINE 대화창 위에 겹치는 투명 창. 마우스는 그대로 LINE 으로 지나간다. LINE 창에 딸려 있어(owner)
// 다른 창이 LINE 을 덮으면 같이 덮이고, LINE 을 내리면 같이 숨는다.
class Overlay : Form
{
    IntPtr owner = IntPtr.Zero;
    bool topmost;
    readonly Font font = new Font("Malgun Gothic", 9f);
    readonly Font small = new Font("Malgun Gothic", 8f);
    public List<Label> Labels = new List<Label>();
    string lastKey = "";

    public Overlay()
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

    public void Set(IntPtr win, Rectangle bounds, List<Label> labels, bool dark, bool canShow)
    {
        if (labels == null || labels.Count == 0 || bounds.Width < 10 || bounds.Height < 10)
        {
            if (Visible) Hide();
            Labels = new List<Label>();
            lastKey = "";
            return;
        }
        StringBuilder key = new StringBuilder(bounds.ToString()).Append(dark);
        foreach (Label l in labels) key.Append('|').Append(l.Avail).Append(l.Text);
        if (Visible && key.ToString() == lastKey) return;
        if (owner != win)
        {
            owner = win;
            Native.SetWindowLongPtr(Handle, Native.GWLP_HWNDPARENT, win);
        }
        Labels = labels;
        lastKey = key.ToString();
        bool shown = !Visible;
        if (!Visible) Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
        // LINE 을 '항상 위' 로 두면 딸린 창도 맨 위여야 LINE 밑에 깔리지 않는다.
        bool top = (Native.GetWindowLongPtr(win, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_TOPMOST) != 0;
        if (top != topmost)
        {
            topmost = top;
            Native.SetWindowPos(Handle, top ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
            shown = true;
        }
        if (shown && !top) PlaceAbove(win);
        Render(bounds, dark);
    }

    // 새로 띄운 창은 모든 창 맨 위로 온다. LINE 바로 위 칸으로 내린다 — LINE 을 덮은 다른 창보다는 아래.
    // 그 뒤로는 LINE 에 딸린 창이라 LINE 과 같이 오르내린다.
    void PlaceAbove(IntPtr win)
    {
        IntPtr above = Native.GetWindow(win, 3); // GW_HWNDPREV
        while (above != IntPtr.Zero && (above == Handle || !Native.IsWindowVisible(above)
            || (Native.GetWindowLongPtr(above, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_TOPMOST) != 0))
            above = Native.GetWindow(above, 3);
        Native.SetWindowPos(Handle, above, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE); // above 가 없으면 0 = 맨 위
    }

    void Render(Rectangle bounds, bool dark)
    {
        Color bg = dark ? Color.FromArgb(242, 50, 54, 60) : Color.FromArgb(245, 255, 252, 226);
        Color fg = dark ? Color.FromArgb(236, 238, 241) : Color.FromArgb(28, 28, 30);
        Color accent = Color.FromArgb(6, 199, 85);
        using (Bitmap bmp = new Bitmap(bounds.Width, bounds.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                foreach (Label l in Labels) DrawLabel(g, l, bounds, bg, fg, accent);
            }
            App.DebugOverlay(bmp, bounds, Handle);
            IntPtr screen = Native.GetDC(IntPtr.Zero);
            IntPtr mem = Native.CreateCompatibleDC(screen);
            IntPtr hbmp = bmp.GetHbitmap(Color.FromArgb(0));
            IntPtr old = Native.SelectObject(mem, hbmp);
            Native.POINT pt = new Native.POINT { X = bounds.X, Y = bounds.Y };
            Native.SIZE sz = new Native.SIZE { W = bounds.Width, H = bounds.Height };
            Native.POINT src = new Native.POINT();
            Native.BLENDFUNCTION bf = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
            if (!Native.UpdateLayeredWindow(Handle, screen, ref pt, ref sz, mem, ref src, 0, ref bf, Native.ULW_ALPHA))
                Log.Write("겹침 창 그리기 실패: " + Marshal.GetLastWin32Error());
            Native.SelectObject(mem, old);
            Native.DeleteObject(hbmp);
            Native.DeleteDC(mem);
            Native.ReleaseDC(IntPtr.Zero, screen);
        }
    }

    // 빈 자리에 맞게 줄을 바꾼다. 안 들어가면 작은 글씨로, 그래도 넘치면 잘라 '…' 를 달고 마우스를 올리면 다 보여 준다.
    void DrawLabel(Graphics g, Label l, Rectangle bounds, Color bg, Color fg, Color accent)
    {
        Rectangle a = l.Avail;
        a.Offset(-bounds.X, -bounds.Y);
        const int padX = 7, padY = 3, bar = 3;
        l.Cut = false;
        if (a.Width < 56)
        {
            // 자리가 거의 없다 — 작은 '한' 표시만. 말풍선에 마우스를 올리면 뜻이 뜬다.
            l.Cut = true;
            if (a.Width < 20) { l.Drawn = Rectangle.Empty; return; }
            Rectangle dot = new Rectangle(l.Mine ? a.Right - 18 : a.Left, a.Top + 2, 18, 18);
            using (SolidBrush b = new SolidBrush(accent)) g.FillEllipse(b, dot);
            TextRenderer.DrawText(g, "한", small, dot, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            l.Drawn = new Rectangle(dot.X + bounds.X, dot.Y + bounds.Y, dot.Width, dot.Height);
            return;
        }
        int textW = a.Width - padX * 2 - bar;
        Font f = font;
        SizeF need = g.MeasureString(l.Text, f, textW);
        if (need.Height > a.Height - padY * 2)
        {
            f = small;
            need = g.MeasureString(l.Text, f, textW);
        }
        int lineH = (int)Math.Ceiling(f.GetHeight(g));
        int maxH = Math.Max(lineH, a.Height - padY * 2);
        if (need.Height > maxH + 1)
        {
            l.Cut = true;
            need.Height = (maxH / lineH) * lineH;
        }
        int w = (int)Math.Ceiling(need.Width) + padX * 2 + bar + 2;
        int h = (int)Math.Ceiling(need.Height) + padY * 2;
        Rectangle r = new Rectangle(l.Mine ? a.Right - w : a.Left, a.Top, w, h);
        using (System.Drawing.Drawing2D.GraphicsPath p = Rounded(r, 6))
        using (SolidBrush b = new SolidBrush(bg)) g.FillPath(b, p);
        using (SolidBrush b = new SolidBrush(accent))
            g.FillRectangle(b, l.Mine ? r.Right - bar - 1 : r.Left + 1, r.Top + 4, bar, Math.Max(4, r.Height - 8));
        StringFormat sf = new StringFormat { Trimming = StringTrimming.EllipsisWord };
        RectangleF tr = new RectangleF(r.Left + padX + (l.Mine ? 0 : bar), r.Top + padY, textW + 2, (float)need.Height + 1);
        using (SolidBrush b = new SolidBrush(fg)) g.DrawString(l.Text, f, b, tr, sf);
        l.Drawn = new Rectangle(r.X + bounds.X, r.Y + bounds.Y, r.Width, r.Height);
    }

    static System.Drawing.Drawing2D.GraphicsPath Rounded(Rectangle r, int rad)
    {
        System.Drawing.Drawing2D.GraphicsPath p = new System.Drawing.Drawing2D.GraphicsPath();
        int d = rad * 2;
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

// LINE 에서 복사한 글자를 본다.
class ClipWatcher : NativeWindow
{
    public event Action Changed;
    public ClipWatcher() { CreateHandle(new CreateParams()); Native.AddClipboardFormatListener(Handle); }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_CLIPBOARDUPDATE && Changed != null) Changed();
        base.WndProc(ref m);
    }
}

// LINE 창 그림에서 말풍선을 찾는다. 색은 정해 두지 않는다(밝은·어두운 테마, 내 초록·상대 회색 모두).
// 한 줄 안에서 바탕색과 다른 칸이 세로로 많이 찬 기둥들 = 말풍선 후보. 그 안을 한 색이 거의 채우면 말풍선,
// 여러 색이면 사진·스티커·프로필이다. 가운데에 놓인 것은 날짜·안내 표시라 뺀다.
static class Chat
{
    static int R(int c) { return (c >> 16) & 255; }
    static int G(int c) { return (c >> 8) & 255; }
    static int B(int c) { return c & 255; }
    public static int Dist(int a, int b) { return Math.Abs(R(a) - R(b)) + Math.Abs(G(a) - G(b)) + Math.Abs(B(a) - B(b)); }
    public static int Luma(Color c) { return (c.R * 299 + c.G * 587 + c.B * 114) / 1000; }
    static int Quant(int c) { return ((R(c) >> 3) << 10) | ((G(c) >> 3) << 5) | (B(c) >> 3); }

    // 가장 흔한 색(비슷한 색은 묶어서). 대표로 그 묶음의 첫 픽셀을 돌려준다.
    static int Mode(IEnumerable<int> colors)
    {
        Dictionary<int, int> count = new Dictionary<int, int>();
        Dictionary<int, int> first = new Dictionary<int, int>();
        int best = -1, bestN = 0;
        foreach (int c in colors)
        {
            int q = Quant(c);
            int n;
            count.TryGetValue(q, out n);
            count[q] = ++n;
            if (!first.ContainsKey(q)) first[q] = c;
            if (n > bestN) { bestN = n; best = q; }
        }
        return best < 0 ? 0 : first[best];
    }

    const int InkDist = 40, FillDist = 30;

    public static Bubble Analyze(int[] px, int stride, Rectangle row)
    {
        int L = row.Left, T = row.Top, W = row.Width, H = row.Height;
        if (W < 100 || H < 16) return null;
        List<int> edge = new List<int>();
        for (int y = T; y < T + H; y++) { edge.Add(px[y * stride + L + 1]); edge.Add(px[y * stride + L + W - 2]); }
        int bg = Mode(edge);
        int y0 = T + 2, y1 = T + H - 2, span = y1 - y0;
        int[] ink = new int[W];
        int inkLeft = -1, inkRight = -1;
        for (int x = 0; x < W; x++)
        {
            int n = 0;
            for (int y = y0; y < y1; y++) if (Dist(px[y * stride + L + x], bg) > InkDist) n++;
            ink[x] = n;
            if (n > 0) { if (inkLeft < 0) inkLeft = x; inkRight = x; }
        }
        if (inkLeft < 0) return null;

        // 세로로 35% 넘게 찬 기둥을 잇는다(3픽셀 틈은 같은 덩어리).
        List<int[]> runs = new List<int[]>();
        int start = -1, lastOn = -10;
        for (int x = 0; x <= W; x++)
        {
            bool on = x < W && ink[x] >= span * 0.35;
            if (on)
            {
                if (start < 0 || x - lastOn > 4) { if (start >= 0) runs.Add(new int[] { start, lastOn + 1 }); start = x; }
                lastOn = x;
            }
        }
        if (start >= 0) runs.Add(new int[] { start, lastOn + 1 });

        int[] pick = null;
        int pickFill = 0;
        foreach (int[] run in runs)
        {
            int a = run[0], b = run[1], w = b - a;
            if (w < 16) continue;
            if (a < 24 && w <= 52) continue; // 프로필 사진
            double cx = (a + b) / 2.0;
            if (Math.Abs(cx - W / 2.0) < W * 0.08) continue; // 가운데 = 날짜·안내
            List<int> inside = new List<int>();
            for (int y = y0; y < y1; y++)
                for (int x = a; x < b; x++)
                {
                    int c = px[y * stride + L + x];
                    if (Dist(c, bg) > InkDist) inside.Add(c);
                }
            if (inside.Count == 0) continue;
            int fill = Mode(inside);
            int same = 0;
            foreach (int c in inside) if (Dist(c, fill) < FillDist) same++;
            if (same < inside.Count * 0.55) continue; // 여러 색 = 사진·스티커
            if (pick == null || w > pick[1] - pick[0]) { pick = run; pickFill = fill; }
        }
        if (pick == null) return null;

        // 말풍선의 위아래: 기둥 폭의 절반 넘게 말풍선 색인 줄.
        int top = -1, bottom = -1;
        int pw = pick[1] - pick[0];
        for (int y = T; y < T + H; y++)
        {
            int n = 0;
            for (int x = pick[0]; x < pick[1]; x++) if (Dist(px[y * stride + L + x], pickFill) < FillDist) n++;
            if (n >= pw * 0.5) { if (top < 0) top = y; bottom = y + 1; }
        }
        if (top < 0 || bottom - top < 14) return null;

        Bubble bub = new Bubble();
        bub.Row = row;
        bub.Box = Rectangle.FromLTRB(L + pick[0], top, L + pick[1], bottom);
        bub.Mine = (pick[0] + pick[1]) / 2.0 > W / 2.0;
        bub.InkLeft = L + inkLeft;
        bub.InkRight = L + inkRight + 1;
        bub.Fill = Color.FromArgb(pickFill);
        bub.Bg = Color.FromArgb(bg);
        // 같은 말풍선인지: 말풍선 안 픽셀 그대로의 지문(FNV-1a). 위치는 넣지 않는다(스크롤해도 같은 말).
        ulong hsh = 14695981039346656037UL;
        for (int y = top; y < bottom; y++)
            for (int x = L + pick[0]; x < L + pick[1]; x++)
            {
                hsh ^= (uint)px[y * stride + x];
                hsh *= 1099511628211UL;
            }
        bub.Hash = hsh.ToString("x16") + (bub.Mine ? "m" : "p");
        return bub;
    }

    // 글자 읽기용 그림: 말풍선 안쪽만, 말풍선 색 = 흰색, 글자 = 검정, 4배와 3배 두 장(여백 포함).
    // 둘을 읽어 맞춰 본다 — 한 배율만 쓰면 가끔 얇은 윗모음이 빠졌다(3배: กินข้าว → กนขาว, 4배는 맞음).
    public static Bitmap[] PrepareOcr(int[] px, int stride, Rectangle box, Color fillColor, Color bgColor)
    {
        int fill = fillColor.ToArgb(), bg = bgColor.ToArgb();
        Rectangle r = Rectangle.FromLTRB(box.Left + 5, box.Top + 3, box.Right - 5, box.Bottom - 3);
        if (r.Width < 4 || r.Height < 4) r = box;
        // 밝기로 편다: 말풍선 색 = 흰색, 글자색(말풍선과 가장 다른 밝기, 2% 끝) = 검정. 내 초록 말풍선은 어두운 글자,
        // 어두운 테마의 상대 말풍선은 밝은 글자라 어느 쪽인지 먼저 본다. 색 거리로 펴 봤더니 실제 LINE 에서
        // 획이 흐리거나 뭉개져 태국어를 영어로 읽었다(2026-10-24). 밝기로 펴면 같은 그림을 바로 읽었다.
        int fillL = Luma(fillColor);
        List<int> ls = new List<int>();
        for (int y = r.Top; y < r.Bottom; y++)
            for (int x = r.Left; x < r.Right; x++) ls.Add(Luma(Color.FromArgb(px[y * stride + x])));
        ls.Sort();
        int lo = ls[(int)(ls.Count * 0.02)], hi = ls[Math.Min(ls.Count - 1, (int)(ls.Count * 0.98))];
        int textL = fillL - lo >= hi - fillL ? lo : hi;
        if (Math.Abs(fillL - textL) < 40) textL = fillL > 128 ? 0 : 255; // 글자가 거의 없다
        using (Bitmap gray = new Bitmap(r.Width, r.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            for (int y = 0; y < r.Height; y++)
                for (int x = 0; x < r.Width; x++)
                {
                    int c = px[(r.Top + y) * stride + r.Left + x];
                    int v;
                    // 둥근 모서리 자리만 지운다. '바탕색이면 지우기' 로 했더니 어두운 테마에서 내 말풍선 글자색이
                    // 바탕색과 거의 같아 글자가 지워졌다.
                    bool corner = (x < 7 || x >= r.Width - 7) && (y < 5 || y >= r.Height - 5);
                    if (corner) v = 255;
                    else v =Math.Max(0, Math.Min(255, (Luma(Color.FromArgb(c)) - textL) * 255 / (fillL - textL)));
                    gray.SetPixel(x, y, Color.FromArgb(v, v, v));
                }
            if (App.Debugging)
                using (Bitmap raw = new Bitmap(r.Width, r.Height))
                {
                    for (int y = 0; y < r.Height; y++) for (int x = 0; x < r.Width; x++) raw.SetPixel(x, y, Color.FromArgb(px[(r.Top + y) * stride + r.Left + x]));
                    raw.Save(Path.Combine(Path.GetDirectoryName(Log.FilePath), "debug-raw-" + r.Top + ".png"));
                }
            return new Bitmap[] { Scale(gray, 4), Scale(gray, 3) };
        }
    }

    static Bitmap Scale(Bitmap gray, int k)
    {
        const int pad = 30;
        Bitmap big = new Bitmap(gray.Width * k + pad * 2, gray.Height * k + pad * 2);
        using (Graphics g = Graphics.FromImage(big))
        {
            g.Clear(Color.White);
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(gray, pad, pad, gray.Width * k, gray.Height * k);
        }
        return big;
    }

    // 견주기용: 띄어쓰기·문장부호를 뺀다.
    public static string Norm(string s)
    {
        StringBuilder sb = new StringBuilder();
        foreach (char c in s) if (char.IsLetterOrDigit(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString();
    }

    public static int Lev(string a, string b)
    {
        int[] prev = new int[b.Length + 1], cur = new int[b.Length + 1];
        for (int j = 0; j <= b.Length; j++) prev[j] = j;
        for (int i = 1; i <= a.Length; i++)
        {
            cur[0] = i;
            for (int j = 1; j <= b.Length; j++)
                cur[j] = Math.Min(Math.Min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[b.Length];
    }
}

static class App
{
    public static string Lang = "";
    public static bool Receive = true;
    public static bool Both;              // 바꾼 말 아래 한국어 원문도 같이 보내기
    public static bool ShowKorean = true; // 말풍선 옆에 한국어
    static string target = "LINE";
    static Overlay overlay;
    static string dir, dataDir, settingsFile;
    static Engine engine;
    static LangBar bar;
    static Note note;
    static NotifyIcon tray;
    static Control ui;
    static IntPtr barHwnd, noteHwnd; // 다른 스레드에서 Handle 을 만지지 않게 미리 받아 둔다
    static Native.HookProc hookProc;
    static IntPtr hook;
    static volatile bool busy;
    static bool swallowUp;
    static long ignoreClipUntil;
    static string lastClip;
    static DateTime lastClipAt;
    static readonly Dictionary<uint, bool> lineProcs = new Dictionary<uint, bool>();
    static readonly Regex Hangul = new Regex("[ㄱ-ㆎ가-힣]");
    static readonly Regex Thai = new Regex("[฀-๿]");

    // 입력칸 찾기는 다른 스레드에서 하고, 막대 자리만 여기 적는다.
    static readonly object posLock = new object();
    static Rectangle composerRect = Rectangle.Empty;
    static IntPtr composerWindow = IntPtr.Zero;
    static AutomationElement composerEl;
    static DateTime composerFoundAt = DateTime.MinValue;

    [STAThread]
    static void Main(string[] args)
    {
        string screenTest = null; // 시험용: --screen 프로그램이름 → 그 창을 바로 화면 번역
        for (int i = 0; i + 1 < args.Length; i++)
        {
            if (args[i] == "--target") target = args[i + 1];
            if (args[i] == "--screen") screenTest = args[i + 1];
        }
        // 업데이터가 새 판을 켤 때: 이전 판이 끝나기를 기다렸다 켜지고, 바뀌었다고 알린다.
        bool wait = Array.IndexOf(args, "--wait") >= 0, updated = Array.IndexOf(args, "--updated") >= 0;
        // 크롬 스크립트 설정 창의 '번역 도우미 켜기' 가 th-korean-helper:// 주소로 부른 것(Updater.RegisterLink).
        bool fromLink = false;
        foreach (string a in args) if (a.StartsWith(Updater.LinkScheme + ":", StringComparison.OrdinalIgnoreCase)) fromLink = true;
        bool created;
        using (Mutex m = new Mutex(true, "Local\\th-korean-line-helper-" + target, out created))
        {
            if (!created && wait)
            {
                try { created = m.WaitOne(20000); }
                catch (AbandonedMutexException) { created = true; }
            }
            if (!created)
            {
                // 이미 켜져 있다 — 아무 일도 없으면 눌러도 안 되는 줄 아니, 켜진 쪽이 알림을 띄우게 한다.
                if (fromLink) try { EventWaitHandle.OpenExisting(PingName).Set(); } catch { }
                return;
            }
            // 모니터마다 배율이 달라도 LINE 을 제 크기로 뜨게(시스템 배율로 맞추면 PrintWindow 그림이 늘어나 흐려져
            // 태국어를 못 읽었다). 윈도우 10 1703 보다 옛것이면 예전 방식으로.
            try { if (!Native.SetProcessDpiAwarenessContext((IntPtr)(-4))) Native.SetProcessDPIAware(); }
            catch (EntryPointNotFoundException) { Native.SetProcessDPIAware(); }
            Application.EnableVisualStyles();
            // 화면 쪽 오류는 창을 띄우지 않고 기록만 한다.
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate (object s, ThreadExceptionEventArgs e) { Log.Write("오류: " + e.Exception); };
            dir = Path.GetDirectoryName(Application.ExecutablePath);
            dataDir = Path.Combine(dir, "data");
            Directory.CreateDirectory(dataDir);
            Log.FilePath = Path.Combine(dataDir, "line-helper.log");
            settingsFile = Path.Combine(dataDir, "settings.txt");
            if (Engine.FindNode() == null)
            {
                MessageBox.Show("Node.js 가 없어 번역 엔진을 띄울 수 없습니다.\nhttps://nodejs.org 에서 LTS 를 설치한 뒤 다시 켜 주세요.", "번역 도우미");
                return;
            }
            LoadSettings();
            // 파일 이름을 바꾼 뒤에도(LineHelper.exe → 번역도우미.exe) 윈도우 켤 때 지금 파일로 뜨게 경로를 다시 적는다.
            try { if (AutoStart) AutoStart = true; } catch { }
            Log.Write("시작 — 대상 " + target + ", 언어 " + (Lang == "" ? "끔" : Lang));
            engine = new Engine(dir);
            ui = new Control();
            ui.CreateControl();
            IntPtr force = ui.Handle;
            bar = new LangBar();
            note = new Note();
            barHwnd = bar.Handle;
            noteHwnd = note.Handle;
            overlay = new Overlay();
            IntPtr overlayHandle = overlay.Handle;
            LoadSent();
            new Thread(OcrLoop) { IsBackground = true }.Start();
            SetupTray();
            ScreenKorean.Start(engine, dataDir, ui, screenTest);
            Updater.Start(dir, engine);
            if (updated) Show("번역 도우미", "새 판으로 바꿨습니다", false, 5000);
            const string ready = "LINE 보내기·받기, 아무 프로그램 창에서 " + ScreenKorean.HotkeyName + " = 화면 번역";
            if (fromLink) { Log.Write("크롬 '번역 도우미 켜기' 로 켜짐"); Show("번역 도우미를 켰습니다", ready, false, 6000); }
            EventWaitHandle ping = new EventWaitHandle(false, EventResetMode.AutoReset, PingName);
            new Thread(delegate ()
            {
                while (ping.WaitOne())
                {
                    Log.Write("크롬 '번역 도우미 켜기' — 이미 켜져 있음");
                    Show("번역 도우미가 켜져 있습니다", ready, false, 6000);
                }
            }) { IsBackground = true }.Start();
            ClipWatcher clip = new ClipWatcher();
            clip.Changed += OnClipboard;
            hookProc = HookCallback;
            hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, hookProc, Native.GetModuleHandle(null), 0);
            new Thread(PollLoop) { IsBackground = true }.Start();
            System.Windows.Forms.Timer place = new System.Windows.Forms.Timer();
            place.Interval = 150;
            place.Tick += delegate { PlaceBar(); };
            place.Start();
            ThreadPool.QueueUserWorkItem(delegate { try { engine.Call("warm", "", "", 60000); Log.Write("용어집 준비됨"); } catch (Exception e) { Log.Write("준비 실패: " + e.Message); } });
            Application.Run();
            Native.UnhookWindowsHookEx(hook);
            Native.RemoveClipboardFormatListener(clip.Handle);
            tray.Visible = false;
            engine.Stop();
        }
    }

    // 크롬 '번역 도우미 켜기' 로 다시 불렸을 때 이미 켜진 판에 알리는 신호.
    static string PingName { get { return "Local\\th-korean-line-helper-ping-" + target; } }

    static void LoadSettings()
    {
        try
        {
            foreach (string line in File.ReadAllLines(settingsFile))
            {
                int eq = line.IndexOf('=');
                if (eq < 0) continue;
                string k = line.Substring(0, eq), v = line.Substring(eq + 1);
                if (k == "lang") Lang = v;
                if (k == "receive") Receive = v != "0";
                if (k == "both") Both = v == "1";
                if (k == "korean") ShowKorean = v != "0";
            }
        }
        catch { }
    }

    static void SaveSettings()
    {
        try
        {
            File.WriteAllText(settingsFile, "lang=" + Lang + "\r\nreceive=" + (Receive ? "1" : "0") + "\r\nboth=" + (Both ? "1" : "0")
                + "\r\nkorean=" + (ShowKorean ? "1" : "0") + "\r\n");
        }
        catch { }
    }

    public static void SetBoth(bool on)
    {
        Both = on;
        SaveSettings();
        bar.Invalidate();
        RefreshTray();
        Log.Write("한국어 같이 보내기: " + (on ? "켬" : "끔"));
    }

    public static void SetLang(string id)
    {
        Lang = id;
        SaveSettings();
        bar.Invalidate();
        RefreshTray();
        Log.Write("언어: " + (id == "" ? "끔" : id));
    }

    static string LangName(string id)
    {
        foreach (string[] l in LangBar.Langs) if (l[0] == id) return l[2];
        return id;
    }

    // ---- 트레이 ----

    static ContextMenuStrip menu;

    static void SetupTray()
    {
        menu = new ContextMenuStrip();
        tray = new NotifyIcon();
        tray.Icon = MakeIcon();
        tray.ContextMenuStrip = menu;
        tray.Visible = true;
        RefreshTray();
    }

    static Icon MakeIcon()
    {
        Bitmap b = new Bitmap(32, 32);
        using (Graphics g = Graphics.FromImage(b))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using (SolidBrush br = new SolidBrush(Color.FromArgb(6, 199, 85))) g.FillEllipse(br, 0, 0, 31, 31);
            using (Font f = new Font("Malgun Gothic", 13f, FontStyle.Bold))
                TextRenderer.DrawText(g, "태", f, new Rectangle(0, 0, 32, 32), Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
        return Icon.FromHandle(b.GetHicon());
    }

    public static void RefreshTray()
    {
        tray.Text = "번역 도우미 — LINE " + (Lang == "" ? "보낼 때 그대로" : LangName(Lang) + "로 바꿔 보냄");
        menu.Items.Clear();
        ToolStripMenuItem langs = new ToolStripMenuItem("보낼 때 바꿀 언어");
        ToolStripMenuItem off = new ToolStripMenuItem("끄기 (한국어 그대로)");
        off.Checked = Lang == "";
        off.Click += delegate { SetLang(""); };
        langs.DropDownItems.Add(off);
        foreach (string[] l in LangBar.Langs)
        {
            string id = l[0];
            ToolStripMenuItem it = new ToolStripMenuItem(l[2]);
            it.Checked = Lang == id;
            it.Click += delegate { SetLang(id); };
            langs.DropDownItems.Add(it);
        }
        menu.Items.Add(langs);
        ToolStripMenuItem both = new ToolStripMenuItem("바꾼 말 아래 한국어 원문도 같이 보내기 (+한)");
        both.Checked = Both;
        both.Click += delegate { SetBoth(!Both); };
        menu.Items.Add(both);
        ToolStripMenuItem kor = new ToolStripMenuItem("LINE 말풍선 옆에 한국어 보기");
        kor.Checked = ShowKorean;
        kor.Click += delegate { ShowKorean = !ShowKorean; SaveSettings(); RefreshTray(); };
        menu.Items.Add(kor);
        ToolStripMenuItem recv = new ToolStripMenuItem("LINE 에서 복사한 태국어를 한국어로 보기");
        recv.Checked = Receive;
        recv.Click += delegate { Receive = !Receive; SaveSettings(); RefreshTray(); };
        menu.Items.Add(recv);
        ToolStripMenuItem screen = new ToolStripMenuItem("화면 번역: 앞 창 영어를 한국어로 덮기 (" + ScreenKorean.HotkeyName + ")");
        screen.Checked = ScreenKorean.On;
        screen.Click += delegate
        {
            if (ScreenKorean.On) ScreenKorean.Off();
            else Show("화면 번역", "바꿀 프로그램 창을 앞에 두고 " + ScreenKorean.HotkeyName + " 를 누르세요", false, 6000);
        };
        menu.Items.Add(screen);
        ToolStripMenuItem auto = new ToolStripMenuItem("윈도우 켤 때 같이 켜기");
        auto.Checked = AutoStart;
        auto.Click += delegate { AutoStart = !AutoStart; RefreshTray(); };
        menu.Items.Add(auto);
        ToolStripMenuItem upd = new ToolStripMenuItem("업데이트 확인");
        upd.Click += delegate { ThreadPool.QueueUserWorkItem(delegate { Updater.Check(true); }); };
        menu.Items.Add(upd);
        ToolStripMenuItem logItem = new ToolStripMenuItem("기록 보기");
        logItem.Click += delegate { try { Process.Start("notepad.exe", "\"" + Log.FilePath + "\""); } catch { } };
        menu.Items.Add(logItem);
        menu.Items.Add(new ToolStripSeparator());
        ToolStripMenuItem quit = new ToolStripMenuItem("끝내기");
        quit.Click += delegate { Application.Exit(); };
        menu.Items.Add(quit);
    }

    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    static bool AutoStart
    {
        get
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                return k != null && k.GetValue("th-korean-line-helper") != null;
        }
        set
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, true))
            {
                if (value) k.SetValue("th-korean-line-helper", "\"" + Application.ExecutablePath + "\"");
                else k.DeleteValue("th-korean-line-helper", false);
            }
        }
    }

    // ---- LINE 창·입력칸 ----

    static bool IsLineWindow(IntPtr h)
    {
        if (h == IntPtr.Zero) return false;
        uint pid;
        Native.GetWindowThreadProcessId(h, out pid);
        bool yes;
        lock (lineProcs)
        {
            if (lineProcs.TryGetValue(pid, out yes)) return yes;
            try { yes = string.Equals(Process.GetProcessById((int)pid).ProcessName, target, StringComparison.OrdinalIgnoreCase); }
            catch { yes = false; }
            lineProcs[pid] = yes;
        }
        return yes;
    }

    // 메시지 입력칸: 글자 칸 가운데 창 아래쪽(아래 45%)에 있는 것. 위쪽 칸은 친구·대화 검색이다.
    static bool IsComposer(AutomationElement el, IntPtr win)
    {
        if (el == null) return false;
        AutomationElement.AutomationElementInformation c = el.Current;
        if (c.ControlType != ControlType.Edit && c.ControlType != ControlType.Document) return false;
        Rectangle w = Native.WindowRect(win);
        System.Windows.Rect r = c.BoundingRectangle;
        if (r.IsEmpty || w.IsEmpty || r.Width < 40) return false;
        return r.Bottom > w.Top + w.Height * 0.55 && r.Top >= w.Top && r.Bottom <= w.Bottom + 2;
    }

    static AutomationElement FindComposer(IntPtr win)
    {
        AutomationElement root = AutomationElement.FromHandle(win);
        Condition cond = new OrCondition(
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
        AutomationElement best = null;
        double bestBottom = double.MinValue;
        foreach (AutomationElement e in root.FindAll(TreeScope.Descendants, cond))
        {
            try
            {
                if (!IsComposer(e, win)) continue;
                double b = e.Current.BoundingRectangle.Bottom;
                if (b > bestBottom) { bestBottom = b; best = e; }
            }
            catch { }
        }
        return best;
    }

    static Rectangle ToRect(System.Windows.Rect r)
    {
        return new Rectangle((int)r.Left, (int)r.Top, (int)r.Width, (int)r.Height);
    }

    // LINE 이 앞에 있으면 입력칸 자리를 알아 두고(막대를 그 위에 붙인다), 대화창의 말풍선을 읽는다.
    // LINE 이 뒤에 있어도 보이는 동안은 1초마다 읽는다(새로 온 말도 옆에 한국어가 붙게).
    static IntPtr lastLineWin = IntPtr.Zero;

    static void PollLoop()
    {
        int tick = 0;
        while (true)
        {
            Thread.Sleep(250);
            tick++;
            try
            {
                IntPtr fg = Native.GetForegroundWindow();
                if (Debugging && tick % 4 == 0) Log.Write("앞 창 " + fg + (fg == noteHwnd ? " (알림)" : fg == barHwnd ? " (막대)" : "") + " LINE=" + lastLineWin + " 막대=" + Native.IsWindowVisible(barHwnd) + " 입력칸=" + composerRect);
                if (fg == barHwnd || fg == noteHwnd) fg = lastLineWin; // 혹시 도우미 창이 앞에 와도 LINE 을 보던 중으로 친다
                fg = Native.GetAncestor(fg, Native.GA_ROOT);
                bool lineFg = IsLineWindow(fg) && !Native.IsIconic(fg);
                if (lineFg) lastLineWin = fg;
                // 켜자마자, 또는 쓰던 LINE 창이 닫혔으면 LINE 의 주 창을 찾아 둔다(LINE 을 눌러 앞에 내지 않아도 읽게).
                if (!lineFg && tick % 8 == 0 && (lastLineWin == IntPtr.Zero || !Native.IsWindowVisible(lastLineWin)))
                {
                    foreach (Process p in Process.GetProcessesByName(target))
                        if (p.MainWindowHandle != IntPtr.Zero && Native.IsWindowVisible(p.MainWindowHandle)) { lastLineWin = p.MainWindowHandle; break; }
                }
                IntPtr chatWin = lastLineWin;
                bool chatVisible = chatWin != IntPtr.Zero && Native.IsWindowVisible(chatWin) && !Native.IsIconic(chatWin);
                if (ShowKorean && chatVisible && (lineFg || tick % 4 == 0))
                {
                    Stopwatch rc = Stopwatch.StartNew();
                    try { ReadChat(chatWin, lineFg); }
                    catch (Exception e) { Log.Write("대화 읽기 오류: " + e.Message); ShowLabels(chatWin, Rectangle.Empty, null, false, false); }
                    if (rc.ElapsedMilliseconds > 700) Log.Write("대화 읽기 느림 " + rc.ElapsedMilliseconds + "ms");
                }
                else if (!ShowKorean || !chatVisible) ShowLabels(chatWin, Rectangle.Empty, null, false, false);
                if (!lineFg)
                {
                    lock (posLock) composerRect = Rectangle.Empty;
                    continue;
                }
                AutomationElement el = null;
                Rectangle rect = Rectangle.Empty;
                lock (posLock) { if (composerWindow == fg) el = composerEl; }
                if (el != null && (DateTime.Now - composerFoundAt).TotalSeconds < 3)
                {
                    try { rect = IsComposer(el, fg) ? ToRect(el.Current.BoundingRectangle) : Rectangle.Empty; }
                    catch { rect = Rectangle.Empty; }
                }
                if (rect.IsEmpty)
                {
                    el = FindComposer(fg);
                    rect = el != null ? ToRect(el.Current.BoundingRectangle) : Rectangle.Empty;
                    lock (posLock) { composerEl = el; composerWindow = fg; composerFoundAt = DateTime.Now; }
                }
                lock (posLock) composerRect = rect;
            }
            catch (Exception e)
            {
                lock (posLock) composerRect = Rectangle.Empty;
                Log.Write("입력칸 찾기 오류: " + e.Message);
                Thread.Sleep(1000);
            }
        }
    }

    static void PlaceBar()
    {
        Rectangle r;
        lock (posLock) r = composerRect;
        IntPtr fg = Native.GetForegroundWindow();
        bool keep = fg == barHwnd || fg == noteHwnd || (menu != null && menu.Visible);
        HoverLabels(fg);
        if (r.IsEmpty && !keep) { if (bar.Visible) bar.Hide(); return; }
        if (r.IsEmpty) return;
        Point p = new Point(r.Right - bar.Width, r.Top - bar.Height - 2);
        if (bar.Location != p || !bar.Visible) bar.ShowAt(new Rectangle(p, bar.Size));
    }

    // ---- 받은 말: 말풍선 옆 한국어 ----
    // LINE 은 메시지 글자를 다른 프로그램에 주지 않는다. 대신 메시지 목록의 줄마다 자리(ListItem 의 사각형)는
    // 알려 준다. 그래서 LINE 창을 그림으로 떠서(PrintWindow — 다른 창에 가려져도 된다) 줄마다 말풍선을 찾고,
    // 말풍선 안 글자를 읽어(engine ocr) 옮긴 뒤, 말풍선 옆 빈자리에 한국어를 겹쳐 그린다.

    static readonly Dictionary<string, Msg> msgs = new Dictionary<string, Msg>();
    static readonly List<KeyValuePair<string, Bitmap[]>> ocrJobs = new List<KeyValuePair<string, Bitmap[]>>();
    static readonly Dictionary<string, bool> jobMine = new Dictionary<string, bool>();
    static AutomationElement msgList;
    static IntPtr msgListWin = IntPtr.Zero;
    static DateTime msgListAt = DateTime.MinValue;
    static string hoverKey;
    static Dictionary<string, KeyValuePair<Label, int>> sticky = new Dictionary<string, KeyValuePair<Label, int>>();

    // 메시지 목록: 입력칸보다 위에 있는 목록 가운데 가장 큰 것(왼쪽의 대화방 목록은 입력칸 아래까지 내려온다).
    static AutomationElement FindMessageList(IntPtr win)
    {
        Rectangle comp;
        lock (posLock) comp = composerWindow == win ? composerRect : Rectangle.Empty;
        AutomationElement best = null;
        double bestArea = 0;
        AutomationElement root = AutomationElement.FromHandle(win);
        foreach (AutomationElement e in root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.List)))
        {
            System.Windows.Rect r = e.Current.BoundingRectangle;
            if (r.IsEmpty || r.Width < 200 || r.Height < 80) continue;
            if (!comp.IsEmpty && (r.Bottom > comp.Top + 8 || r.Right < comp.Left || r.Left > comp.Right)) continue;
            double area = comp.IsEmpty ? r.Width : r.Width * r.Height; // 입력칸을 모르면 넓은 쪽(메시지 목록이 대화방 목록보다 넓다)
            if (area > bestArea) { bestArea = area; best = e; }
        }
        return best;
    }

    static void ReadChat(IntPtr win, bool lineFg)
    {
        if (msgListWin != win || msgList == null || (DateTime.Now - msgListAt).TotalSeconds > 3)
        {
            msgList = FindMessageList(win);
            msgListWin = win;
            msgListAt = DateTime.Now;
        }
        if (msgList == null) { ShowLabels(win, Rectangle.Empty, null, false, false); return; }
        Rectangle lr;
        AutomationElementCollection items;
        CacheRequest cr = new CacheRequest();
        cr.Add(AutomationElement.BoundingRectangleProperty);
        cr.Add(AutomationElement.ControlTypeProperty);
        try
        {
            lr = ToRect(msgList.Current.BoundingRectangle);
            using (cr.Activate()) items = msgList.FindAll(TreeScope.Children, Condition.TrueCondition);
        }
        catch (ElementNotAvailableException) { msgList = null; return; }
        Rectangle wr = Native.WindowRect(win);
        if (lr.IsEmpty || wr.IsEmpty) return;

        int[] px;
        using (Bitmap cap = new Bitmap(wr.Width, wr.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(cap))
            {
                IntPtr dc = g.GetHdc();
                Native.PrintWindow(win, dc, Native.PW_RENDERFULLCONTENT);
                g.ReleaseHdc(dc);
            }
            System.Drawing.Imaging.BitmapData bd = cap.LockBits(new Rectangle(0, 0, wr.Width, wr.Height),
                System.Drawing.Imaging.ImageLockMode.ReadOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            px = new int[wr.Width * wr.Height];
            for (int y = 0; y < wr.Height; y++) Marshal.Copy(bd.Scan0 + y * bd.Stride, px, y * wr.Width, wr.Width);
            cap.UnlockBits(bd);
        }

        List<Label> labels = new List<Label>();
        Dictionary<string, KeyValuePair<Label, int>> nextSticky = new Dictionary<string, KeyValuePair<Label, int>>();
        StringBuilder trace = new StringBuilder(); // 줄마다 무엇이 됐는지(표시 개수가 바뀔 때 기록에 남긴다)
        bool dark = false;
        foreach (AutomationElement it in items)
        {
            if (it.Cached.ControlType != ControlType.ListItem) continue;
            Rectangle r = ToRect(it.Cached.BoundingRectangle);
            trace.Append(" ").Append(r.Top - lr.Top).Append(":");
            if (r.Height < 16 || r.Top < lr.Top || r.Bottom > lr.Bottom) { trace.Append("cut"); continue; } // 반쯤 가린 줄은 반쪽 글자를 읽는다
            Rectangle rc = new Rectangle(r.X - wr.X, r.Y - wr.Y, r.Width, r.Height);
            rc.Intersect(new Rectangle(0, 0, wr.Width, wr.Height));
            Bubble b = Chat.Analyze(px, wr.Width, rc);
            string rowKey = r.Left + "," + r.Top + "," + r.Width + "," + r.Height;
            if (b == null)
            {
                // 그리는 도중을 뜬 그림이면 한 번쯤 말풍선을 못 찾는다 — 같은 자리에 있던 표시는 잠깐(세 번까지) 둔다.
                trace.Append("none");
                DebugRow(px, wr.Width, rc);
                KeyValuePair<Label, int> keep;
                if (sticky.TryGetValue(rowKey, out keep) && keep.Value < 3)
                {
                    labels.Add(keep.Key);
                    nextSticky[rowKey] = new KeyValuePair<Label, int>(keep.Key, keep.Value + 1);
                }
                continue;
            }
            trace.Append(b.Hash.Substring(0, 4));
            dark = Chat.Luma(b.Bg) < 128;
            b.Row.Offset(wr.X, wr.Y);
            b.Box.Offset(wr.X, wr.Y);
            b.InkLeft += wr.X;
            b.InkRight += wr.X;
            Msg m;
            lock (msgs)
            {
                if (msgs.Count > 3000) msgs.Clear();
                if (!msgs.TryGetValue(b.Hash, out m) || (m.Done && m.Ko == "" && m.FailedAt != DateTime.MinValue && (DateTime.Now - m.FailedAt).TotalSeconds > 20))
                {
                    m = new Msg();
                    msgs[b.Hash] = m;
                    Rectangle box = b.Box;
                    box.Offset(-wr.X, -wr.Y);
                    Bitmap[] img = Chat.PrepareOcr(px, wr.Width, box, b.Fill, b.Bg);
                    lock (ocrJobs)
                    {
                        ocrJobs.Add(new KeyValuePair<string, Bitmap[]>(b.Hash, img));
                        jobMine[b.Hash] = b.Mine;
                        Monitor.Pulse(ocrJobs);
                    }
                }
            }
            if (!m.Done || m.Ko == "") { trace.Append(m.Done ? "-" : "?"); continue; }
            trace.Append("+");
            Label l = new Label();
            l.Mine = b.Mine;
            l.Thai = m.Thai;
            l.Ko = m.Ko;
            l.Text = m.Mark == "" ? m.Ko : m.Mark + " " + m.Ko;
            l.Hover = b.Box;
            int top = b.Box.Top, h = Math.Max(b.Box.Height, 22);
            if (top + h > lr.Bottom) h = lr.Bottom - top;
            l.Avail = b.Mine ? Rectangle.FromLTRB(b.Row.Left + 10, top, b.InkLeft - 8, top + h)
                             : Rectangle.FromLTRB(b.InkRight + 8, top, b.Row.Right - 10, top + h);
            labels.Add(l);
            nextSticky[rowKey] = new KeyValuePair<Label, int>(l, 0);
        }
        sticky = nextSticky;
        ShowLabels(win, lr, labels, dark, lineFg, trace.ToString());
    }

    public static bool Debugging { get { return File.Exists(Path.Combine(dataDir, "debug")); } }
    static int lastLabelCount = -1;
    static string lastTrace = "";

    // data 폴더에 debug 파일을 두면 겹침 그림과 자리를 남긴다(시험용).
    public static void DebugOverlay(Bitmap bmp, Rectangle bounds, IntPtr h)
    {
        if (!File.Exists(Path.Combine(dataDir, "debug"))) return;
        try
        {
            bmp.Save(Path.Combine(dataDir, "overlay.png"));
            File.WriteAllText(Path.Combine(dataDir, "overlay.txt"), bounds.X + "," + bounds.Y + "," + bounds.Width + "," + bounds.Height + " visible=" + Native.IsWindowVisible(h));
        }
        catch { }
    }

    // data 폴더에 debug 파일을 두면 말풍선을 못 찾은 줄의 그림을 남긴다(몇 장만).
    static int debugSaved;
    static void DebugRow(int[] px, int stride, Rectangle rc)
    {
        if (debugSaved >= 6 || !File.Exists(Path.Combine(dataDir, "debug"))) return;
        using (Bitmap bm = new Bitmap(rc.Width, rc.Height))
        {
            for (int y = 0; y < rc.Height; y++) for (int x = 0; x < rc.Width; x++) bm.SetPixel(x, y, Color.FromArgb(px[(rc.Top + y) * stride + rc.Left + x]));
            bm.Save(Path.Combine(dataDir, "debug-row-" + (debugSaved++) + "-" + rc.Top + ".png"));
        }
    }

    static void ShowLabels(IntPtr win, Rectangle bounds, List<Label> labels, bool dark, bool canShow, string trace = "")
    {
        int n = labels == null ? 0 : labels.Count;
        if (n != lastLabelCount || (trace != lastTrace && File.Exists(Path.Combine(dataDir, "debug")))) Log.Write("말풍선 옆 한국어 " + n + "개" + trace);
        lastLabelCount = n;
        lastTrace = trace;
        ui.BeginInvoke((MethodInvoker)delegate { overlay.Set(win, bounds, labels, dark, canShow); });
    }

    // 말풍선 글자 읽기 → 태국어면 옮기기. 최근(아래쪽) 말풍선부터.
    static void OcrLoop()
    {
        string tmp = Path.Combine(dataDir, "ocr");
        Directory.CreateDirectory(tmp);
        while (true)
        {
            KeyValuePair<string, Bitmap[]> job;
            bool mine;
            lock (ocrJobs)
            {
                while (ocrJobs.Count == 0) Monitor.Wait(ocrJobs);
                job = ocrJobs[ocrJobs.Count - 1];
                ocrJobs.RemoveAt(ocrJobs.Count - 1);
                mine = jobMine[job.Key];
                jobMine.Remove(job.Key);
            }
            Msg m;
            lock (msgs) msgs.TryGetValue(job.Key, out m);
            if (m == null) m = new Msg();
            string file = Path.Combine(tmp, job.Key + "-4.png"), file3 = Path.Combine(tmp, job.Key + "-3.png");
            try
            {
                job.Value[0].Save(file, System.Drawing.Imaging.ImageFormat.Png);
                job.Value[1].Save(file3, System.Drawing.Imaging.ImageFormat.Png);
                job.Value[0].Dispose();
                job.Value[1].Dispose();
                string[] r4 = engine.Call("ocr", "", file, 30000), r3 = engine.Call("ocr", "", file3, 30000);
                // 두 배율이 같게 읽으면 확실. 다르면 확신도가 높은 쪽인데, 그것도 90 아래면 옮기지 않는다(오역보다 안내).
                bool same = Chat.Norm(r4[0]) == Chat.Norm(r3[0]);
                int c4 = ParseInt(r4[1]), c3 = ParseInt(r3[1]);
                string text = same || c4 >= c3 ? r4[0] : r3[0];
                bool sure = same || Math.Max(c4, c3) >= 90;
                if (Debugging)
                {
                    File.Copy(file, Path.Combine(dataDir, "debug-ocr-" + job.Key.Substring(0, 6) + ".png"), true);
                    Log.Write("읽음 " + job.Key.Substring(0, 6) + " 4배[" + r4[0] + "] " + c4 + " 3배[" + r3[0] + "] " + c3);
                }
                string ko = "", mark = "";
                int thai = Thai.Matches(text).Count;
                if (thai >= 2 && !Hangul.IsMatch(text) && !sure)
                {
                    ko = "글자가 흐려 확실히 못 읽었어요 — 복사하면 옮겨 줘요";
                    mark = "?";
                    Log.Write("말풍선 확실하지 않음: 4배[" + r4[0] + "] " + c4 + " / 3배[" + r3[0] + "] " + c3);
                }
                else if (thai >= 2 && !Hangul.IsMatch(text))
                {
                    if (mine)
                    {
                        string sent = FindSent(text);
                        if (sent != null) { ko = sent; mark = "✎"; } // 도우미로 보낸 말 — 내가 쓴 한국어 그대로
                        else { ko = engine.Call("ko", "", text, 12000)[0]; mark = "↩"; }
                    }
                    else ko = engine.Call("ko", "", text, 12000)[0];
                    Log.Write("말풍선 " + (mine ? "(나) " : "") + "[" + text + "] → [" + ko + "]");
                }
                m.Thai = text;
                m.Ko = ko;
                m.Mark = mark;
                m.Done = true;
            }
            catch (Exception e)
            {
                Log.Write("말풍선 읽기 실패: " + e.Message);
                m.Ko = "";
                m.FailedAt = DateTime.Now;
                m.Done = true;
            }
            finally
            {
                try { File.Delete(file); File.Delete(file3); } catch { }
            }
        }
    }

    static int ParseInt(string s) { int n; return int.TryParse(s, out n) ? n : 0; }

    // 잘려 그린 한국어(…)는 말풍선이나 표시에 마우스를 올리면 다 보여 준다.
    static void HoverLabels(IntPtr fg)
    {
        if (!overlay.Visible || !IsLineWindow(Native.GetAncestor(fg, Native.GA_ROOT))) { hoverKey = null; return; }
        Point p = Cursor.Position;
        foreach (Label l in overlay.Labels)
        {
            if (!l.Cut || !(l.Hover.Contains(p) || l.Drawn.Contains(p))) continue;
            string key = l.Hover + l.Ko;
            if (key != hoverKey) note.Pop(l.Thai, l.Ko, p, false, false, 10000);
            hoverKey = key;
            return;
        }
        hoverKey = null;
    }

    // ---- 보낸 말 기록: 내 말풍선 옆에 내가 쓴 한국어를 붙인다 ----

    static readonly List<string[]> sentLog = new List<string[]>();

    static string SentFile { get { return Path.Combine(dataDir, "sent.tsv"); } }

    static void LoadSent()
    {
        try
        {
            foreach (string line in File.ReadAllLines(SentFile, Encoding.UTF8))
            {
                string[] p = line.Split('\t');
                if (p.Length == 2) sentLog.Add(new string[] { p[0].Replace("\\n", "\n"), p[1].Replace("\\n", "\n") });
            }
        }
        catch { }
    }

    static void AddSent(string ko, string sent)
    {
        lock (sentLog)
        {
            sentLog.Add(new string[] { ko, sent });
            if (sentLog.Count > 300) sentLog.RemoveRange(0, sentLog.Count - 300);
            try
            {
                StringBuilder sb = new StringBuilder();
                foreach (string[] e in sentLog) sb.Append(e[0].Replace("\n", "\\n")).Append('\t').Append(e[1].Replace("\n", "\\n")).Append("\r\n");
                File.WriteAllText(SentFile, sb.ToString(), Encoding.UTF8);
            }
            catch { }
        }
    }

    // 읽은 글자는 한두 글자 틀릴 수 있다 — 비슷하면(75%) 같은 말로 본다. 최근에 보낸 것부터.
    static string FindSent(string thai)
    {
        string a = Chat.Norm(thai);
        if (a.Length < 2) return null;
        lock (sentLog)
        {
            for (int i = sentLog.Count - 1; i >= 0; i--)
            {
                string b = Chat.Norm(sentLog[i][1]);
                if (b.Length == 0) continue;
                if (1.0 - (double)Chat.Lev(a, b) / Math.Max(a.Length, b.Length) >= 0.75) return sentLog[i][0];
            }
        }
        return null;
    }

    // ---- Enter ----

    static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            Native.KBDLLHOOKSTRUCT k = (Native.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
            int msg = (int)wParam;
            if (k.vkCode == Native.VK_RETURN && k.dwExtraInfo != Native.MARK)
            {
                bool down = msg == Native.WM_KEYDOWN || msg == Native.WM_SYSKEYDOWN;
                if (down)
                {
                    IntPtr fg = Native.GetAncestor(Native.GetForegroundWindow(), Native.GA_ROOT);
                    if (busy && IsLineWindow(fg)) return (IntPtr)1; // 바꾸는 동안 또 누른 Enter 는 버린다
                    bool mods = Native.Down(Native.VK_SHIFT) || Native.Down(Native.VK_CONTROL) || Native.Down(Native.VK_MENU)
                        || Native.Down(Native.VK_LWIN) || Native.Down(Native.VK_RWIN);
                    if (Lang != "" && !mods && IsLineWindow(fg))
                    {
                        busy = true;
                        swallowUp = true;
                        string lang = Lang;
                        ThreadPool.QueueUserWorkItem(delegate { OnEnter(fg, lang); });
                        return (IntPtr)1;
                    }
                }
                else if (swallowUp)
                {
                    swallowUp = false;
                    return (IntPtr)1;
                }
            }
        }
        return Native.CallNextHookEx(hook, nCode, wParam, lParam);
    }

    static string ReadText(AutomationElement el)
    {
        object pat;
        string v = "";
        if (el.TryGetCurrentPattern(ValuePattern.Pattern, out pat)) v = ((ValuePattern)pat).Current.Value ?? "";
        if (v.Length == 0 && el.TryGetCurrentPattern(TextPattern.Pattern, out pat)) v = ((TextPattern)pat).DocumentRange.GetText(-1) ?? "";
        return v.Replace("\r\n", "\n").Replace('\r', '\n').Replace((char)0x2029, (char)10).Trim();
    }

    static bool SameFocus(IntPtr win, AutomationElement el)
    {
        if (Native.GetAncestor(Native.GetForegroundWindow(), Native.GA_ROOT) != win) return false;
        try { return Automation.Compare(AutomationElement.FocusedElement, el); } catch { return false; }
    }

    static void PassEnter() { Native.Tap(Native.VK_RETURN, false); }

    static void OnEnter(IntPtr win, string lang)
    {
        Stopwatch sw = Stopwatch.StartNew(); // 구간마다 걸린 시간을 기록에 남긴다
        long tRead = 0, tMt = 0, tPaste = 0;
        bool decided = false; // 한국어를 읽은 뒤에는 실패해도 그냥 보내지 않는다(태국 친구에게 한국어가 가지 않게)
        try
        {
            AutomationElement el = AutomationElement.FocusedElement;
            if (!IsComposer(el, win))
            {
                decided = true;
                PassEnter();
                if (el != null) Log.Write("Enter: 입력칸 아님 (" + el.Current.ControlType.ProgrammaticName + " / " + el.Current.ClassName + ")");
                return;
            }
            Native.Tap(Native.VK_RIGHT, true); // 조합 중인 마지막 글자를 확정한다(끝에서는 커서가 안 움직인다)
            Thread.Sleep(40);
            string text = ReadText(el);
            tRead = sw.ElapsedMilliseconds;
            if (!Hangul.IsMatch(text)) { decided = true; PassEnter(); return; }
            decided = true;
            SetBusy(true);
            string[] res;
            try { res = engine.Call("to", lang, text, 12000); }
            catch (Exception e)
            {
                Log.Write("번역 실패 [" + text + "]: " + e.Message);
                Native.MessageBeep(0x10);
                Show("보내지 않았어요 — " + e.Message, text, true, 5000);
                return;
            }
            string outText = res[0];
            tMt = sw.ElapsedMilliseconds;
            if (!SameFocus(win, el))
            {
                Log.Write("창이 바뀌어 보내지 않음 [" + text + "]");
                Show("창이 바뀌어서 보내지 않았어요", text + "\n→ " + outText, true, 6000);
                return;
            }
            // +한: 바꾼 말 아래 줄에 한국어 원문 — 상대에게도 같이 가고, LINE 화면에 둘 다 남는다.
            string paste = Both ? outText + "\n" + text : outText;
            if (!PutText(el, paste))
            {
                Log.Write("입력칸 바꾸기 실패 [" + text + "] → " + outText);
                Native.MessageBeep(0x10);
                Show("입력칸을 바꾸지 못해 보내지 않았어요", text + "\n→ " + outText, true, 6000);
                return;
            }
            tPaste = sw.ElapsedMilliseconds;
            PassEnter();
            AddSent(text, outText);
            Log.Write("보냄 [" + text + "] → [" + outText + "] (" + res[1] + ")" + (Both ? " +한" : "")
                + string.Format(" — 읽기 {0}ms, 번역 {1}ms, 붙여넣기 {2}ms", tRead, tMt - tRead, tPaste - tMt));
            string head = text + "  (" + res[1] + ")";
            Show(head, outText, false, 4000);
            if (lang == "th")
            {
                // 보낸 태국어를 다시 한국어로 — 뜻이 맞게 갔는지 본다(메신저의 되옮김과 같다). 다음 Enter 는 기다리지 않는다.
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try
                    {
                        string[] back = engine.Call("ko", "", outText, 8000);
                        Show(head, outText + "\n↩ " + back[0], false, 6000);
                    }
                    catch { }
                });
            }
        }
        catch (Exception e)
        {
            Log.Write("Enter 처리 오류: " + e.Message);
            if (!decided) PassEnter();
        }
        finally
        {
            SetBusy(false);
            busy = false;
        }
    }

    // 입력칸 글자를 통째로 바꾼다. 사람이 하듯 붙여넣기(Ctrl+A, Ctrl+V) — 클립보드는 되돌려 놓는다.
    // 붙여넣기가 안 먹으면 접근성으로 값을 넣어 본다.
    static bool PutText(AutomationElement el, string text)
    {
        IDataObject saved = null;
        ui.Invoke((MethodInvoker)delegate
        {
            saved = CopyClipboard();
            Interlocked.Exchange(ref ignoreClipUntil, DateTime.Now.AddSeconds(2).Ticks);
            SetClipboardText(text);
        });
        try
        {
            Native.Ctrl(0x41); // A
            Thread.Sleep(30);
            Native.Ctrl(0x56); // V
            for (int i = 0; i < 10; i++)
            {
                Thread.Sleep(30);
                if (Took(el, text)) return true;
            }
            object pat;
            if (el.TryGetCurrentPattern(ValuePattern.Pattern, out pat))
            {
                ((ValuePattern)pat).SetValue(text);
                Thread.Sleep(60);
                if (Took(el, text)) return true;
            }
            return false;
        }
        finally
        {
            Thread t = new Thread(delegate ()
            {
                Thread.Sleep(400); // 붙여넣기가 끝난 뒤에 되돌린다
                try
                {
                    ui.Invoke((MethodInvoker)delegate
                    {
                        Stopwatch rw = Stopwatch.StartNew();
                        Interlocked.Exchange(ref ignoreClipUntil, DateTime.Now.AddSeconds(1).Ticks);
                        RestoreClipboard(saved);
                        if (rw.ElapsedMilliseconds > 300) Log.Write("클립보드 되돌리기 " + rw.ElapsedMilliseconds + "ms");
                    });
                }
                catch { }
            });
            t.IsBackground = true;
            t.Start();
        }
    }

    static bool Took(AutomationElement el, string text)
    {
        string v = Regex.Replace(ReadText(el), "\\s+", "");
        return v.Length > 0 && v == Regex.Replace(text, "\\s+", "");
    }

    static IDataObject CopyClipboard()
    {
        try
        {
            IDataObject src = Clipboard.GetDataObject();
            if (src == null) return null;
            DataObject copy = new DataObject();
            foreach (string f in src.GetFormats(false))
            {
                try { object d = src.GetData(f, false); if (d != null) copy.SetData(f, false, d); } catch { }
            }
            return copy;
        }
        catch { return null; }
    }

    static void SetClipboardText(string text)
    {
        for (int i = 0; i < 5; i++)
        {
            try { Clipboard.SetText(text, TextDataFormat.UnicodeText); return; }
            catch (ExternalException) { Thread.Sleep(30); }
        }
    }

    static void RestoreClipboard(IDataObject saved)
    {
        for (int i = 0; i < 5; i++)
        {
            try
            {
                if (saved != null && saved.GetFormats(false).Length > 0) Clipboard.SetDataObject(saved, true);
                else Clipboard.Clear();
                return;
            }
            catch (ExternalException) { Thread.Sleep(30); }
        }
    }

    // ---- 받기: LINE 에서 복사한 태국어 ----

    static void OnClipboard()
    {
        if (!Receive || DateTime.Now.Ticks < Interlocked.Read(ref ignoreClipUntil)) return;
        if (!IsLineWindow(Native.GetAncestor(Native.GetForegroundWindow(), Native.GA_ROOT))) return;
        string text = null;
        for (int i = 0; i < 3 && text == null; i++)
        {
            try { text = Clipboard.ContainsText() ? Clipboard.GetText() : ""; }
            catch (ExternalException) { Thread.Sleep(30); }
        }
        if (string.IsNullOrEmpty(text) || !Thai.IsMatch(text) || text.Length > 2000) return;
        // 한 번 복사에 알림이 두 번 오기도 한다(글자를 넣고 다시 확정할 때).
        if (text == lastClip && (DateTime.Now - lastClipAt).TotalSeconds < 2) return;
        lastClip = text;
        lastClipAt = DateTime.Now;
        Point at = Cursor.Position;
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                string[] r = engine.Call("ko", "", text, 12000);
                Log.Write("받음 [" + text + "] → [" + r[0] + "] (" + r[1] + ")");
                ui.BeginInvoke((MethodInvoker)delegate { note.Pop(text.Trim(), r[0], at, false, false, 15000); });
            }
            catch (Exception e)
            {
                Log.Write("받은 말 번역 실패 [" + text + "]: " + e.Message);
                ui.BeginInvoke((MethodInvoker)delegate { note.Pop("번역 실패 — " + e.Message, text.Trim(), at, false, true, 6000); });
            }
        });
    }

    // ---- 화면 ----

    // 업데이터가 새 exe 로 갈아 끼운 뒤 이 판을 끝낸다.
    public static void Quit() { ui.BeginInvoke((MethodInvoker)delegate { Application.Exit(); }); }

    static void SetBusy(bool on)
    {
        ui.BeginInvoke((MethodInvoker)delegate { bar.Busy = on; bar.Invalidate(); });
    }

    // 보내기 알림은 막대 위에 띄운다.
    public static void Show(string top, string main, bool error, int ms)
    {
        ui.BeginInvoke((MethodInvoker)delegate
        {
            Point at = bar.Visible ? new Point(bar.Right - 300, bar.Top) : Cursor.Position;
            note.Pop(top, main, at, bar.Visible, error, ms);
        });
    }
}
