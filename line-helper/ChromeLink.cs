// 크롬 '통합 번역' 확장과 잇기 — 크롬의 네이티브 메시징.
// 확장이 chrome.runtime.sendNativeMessage 로 부르면 크롬이 이 exe 를 "chrome-extension://<id>/" 인자로 켠다.
// 그때는 트레이 앱이 아니라 이 짧은 모드로 돌아, 받은 명령을 처리해 답하고 끝난다(크롬이 통로를 닫으면 끝).
//   {"cmd":"status"}               → 켜져 있는지
//   {"cmd":"start","manual":true}  → 꺼져 있으면 트레이 앱을 따로 켠다(manual 이면 '켰습니다' 알림)
//   {"cmd":"stop"}                 → 켜진 도우미에 끄기 신호(App.QuitName)
// 메시지 꼴: 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON. 크롬이 이 exe 를 찾도록
// HKCU\Software\Google\Chrome\NativeMessagingHosts\<HostName> 에 설명 파일(json) 경로를 적는다(Register).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class ChromeLink
{
    public const string HostName = "com.th_korean.helper";
    // 이 exe 를 부를 수 있는 확장. 압축해제로 불러온 통합 번역(extension/build.js 의 DEV_KEY 로 고정한 id).
    // 웹스토어에 올리면 스토어가 준 id 도 여기 더한다.
    static readonly string[] Origins = { "chrome-extension://agcbmglciepeobcgkniefahkaiigjkjk/" };
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    public static bool IsHostCall(string[] args)
    {
        foreach (string a in args)
            if (a.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    public static void Run(string mutexName, string quitName)
    {
        Stream input = Console.OpenStandardInput();
        Stream output = Console.OpenStandardOutput();
        while (true)
        {
            byte[] head = ReadExactly(input, 4);
            if (head == null) return;
            int n = BitConverter.ToInt32(head, 0);
            if (n <= 0 || n > (1 << 20)) return;
            byte[] body = ReadExactly(input, n);
            if (body == null) return;
            Dictionary<string, object> req;
            try { req = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body)); }
            catch { req = new Dictionary<string, object>(); }
            Dictionary<string, object> res;
            try { res = Handle(req, mutexName, quitName); }
            catch (Exception e) { res = Reply(false, IsRunning(mutexName)); res["error"] = e.Message; }
            byte[] o = Encoding.UTF8.GetBytes(json.Serialize(res));
            output.Write(BitConverter.GetBytes(o.Length), 0, 4);
            output.Write(o, 0, o.Length);
            output.Flush();
        }
    }

    static Dictionary<string, object> Handle(Dictionary<string, object> req, string mutexName, string quitName)
    {
        object v;
        string cmd = req.TryGetValue("cmd", out v) ? Convert.ToString(v) : "";
        bool manual = req.TryGetValue("manual", out v) && v is bool && (bool)v;
        bool running = IsRunning(mutexName);
        if (cmd == "start" && !running)
        {
            ProcessStartInfo si = new ProcessStartInfo(Application.ExecutablePath);
            si.WorkingDirectory = Path.GetDirectoryName(Application.ExecutablePath);
            si.UseShellExecute = false;
            // 손으로 누른 것만 '번역 도우미를 켰습니다' 알림(크롬을 켤 때마다 뜨면 귀찮다).
            if (manual) si.Arguments = "\"" + Updater.LinkScheme + "://start\"";
            Process.Start(si);
            running = WaitFor(mutexName, true, 15000);
        }
        else if (cmd == "stop" && running)
        {
            try { EventWaitHandle.OpenExisting(quitName).Set(); }
            catch (WaitHandleCannotBeOpenedException)
            {
                // 끄기 신호를 모르는 옛 판 — 트레이의 '끝내기' 처럼 끝낼 길이 없어 프로세스를 닫는다.
                foreach (Process p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Application.ExecutablePath)))
                    if (p.Id != Process.GetCurrentProcess().Id) try { p.Kill(); } catch { }
            }
            running = WaitFor(mutexName, false, 15000);
        }
        return Reply(true, running);
    }

    static Dictionary<string, object> Reply(bool ok, bool running)
    {
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["ok"] = ok;
        r["running"] = running;
        r["path"] = Application.ExecutablePath;
        return r;
    }

    public static bool IsRunning(string mutexName)
    {
        Mutex m;
        if (!Mutex.TryOpenExisting(mutexName, out m)) return false;
        m.Dispose();
        return true;
    }

    static bool WaitFor(string mutexName, bool want, int ms)
    {
        for (int t = 0; t < ms; t += 200)
        {
            if (IsRunning(mutexName) == want) return want;
            Thread.Sleep(200);
        }
        return IsRunning(mutexName);
    }

    static byte[] ReadExactly(Stream s, int n)
    {
        byte[] b = new byte[n];
        int got = 0;
        while (got < n)
        {
            int k = s.Read(b, got, n - got);
            if (k <= 0) return null;
            got += k;
        }
        return b;
    }

    // 이 exe 를 크롬(과 엣지)에 알린다. 이 사용자에게만, 관리자 권한 없이. 설치한 판은 켤 때마다 다시 적는다
    // (Updater.Start). 개발판으로 시험할 때는 '번역도우미.exe --register-chrome' 로 한 번 적는다.
    public static void Register()
    {
        try
        {
            string exe = Application.ExecutablePath;
            string file = Path.Combine(Path.GetDirectoryName(exe), HostName + ".json");
            Dictionary<string, object> m = new Dictionary<string, object>();
            m["name"] = HostName;
            m["description"] = "번역 도우미 — 통합 번역 확장에서 켜고 끄기";
            m["path"] = exe;
            m["type"] = "stdio";
            m["allowed_origins"] = Origins;
            File.WriteAllText(file, json.Serialize(m), new UTF8Encoding(false));
            foreach (string root in new string[] { @"Software\Google\Chrome\NativeMessagingHosts\", @"Software\Microsoft\Edge\NativeMessagingHosts\" })
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(root + HostName)) k.SetValue("", file);
        }
        catch (Exception e) { Log.Write("크롬 확장 연결 등록 실패: " + e.Message); }
    }
}
