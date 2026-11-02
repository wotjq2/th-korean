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
    // 이 exe 를 부를 수 있는 확장. 압축해제로 불러온 통합 번역(extension/build.js 의 DEV_KEY 로 고정한 id)과,
    // 원격 설정(config.json 의 helper.extensionIds)에 적은 id — 웹스토어가 준 id 는 그 파일에 적는다(이 코드는 그대로).
    const string DevId = "agcbmglciepeobcgkniefahkaiigjkjk";
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    static string[] Origins()
    {
        List<string> ids = new List<string> { DevId };
        foreach (string id in RemoteConfig.ExtensionIds()) if (!ids.Contains(id)) ids.Add(id);
        return ids.ConvertAll(id => "chrome-extension://" + id + "/").ToArray();
    }

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
            m["allowed_origins"] = Origins();
            File.WriteAllText(file, json.Serialize(m), new UTF8Encoding(false));
            foreach (string root in new string[] { @"Software\Google\Chrome\NativeMessagingHosts\", @"Software\Microsoft\Edge\NativeMessagingHosts\" })
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(root + HostName)) k.SetValue("", file);
        }
        catch (Exception e) { Log.Write("크롬 확장 연결 등록 실패: " + e.Message); }
    }
}

// 원격 설정(저장소의 config.json) 중 도우미가 쓰는 칸 — 크롬 웹스토어에 올린 뒤로 코드를 고치지 않고 바꾸려고.
//   helper.extensionIds : 이 도우미를 부를 수 있는 확장 id(웹스토어가 준 id)
//   languages           : LINE 언어 막대(태·미·중 …) — 확장의 입력 언어와 같은 목록
// 업데이트 확인 때(켜고 1분 뒤, 6시간마다) 받아 data\config.json 에 두고, 그 사본을 읽는다. 없거나 틀리면 기본값.
// 확장(th-korean.user.js 의 rcBuild)과 같은 규칙으로 꼴을 맞춰 본다 — 틀린 칸은 버린다.
static class RemoteConfig
{
    const string Url = "https://raw.githubusercontent.com/wotjq2/th-korean/main/config.json";
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static readonly System.Text.RegularExpressions.Regex IdRe = new System.Text.RegularExpressions.Regex("^[a-p]{32}$");
    static readonly System.Text.RegularExpressions.Regex LangRe = new System.Text.RegularExpressions.Regex("^[a-z]{2,3}(-[A-Za-z]{2,4})?$");
    public static readonly string[][] DefaultLangs = {
        new[] { "th", "태", "태국어" }, new[] { "en", "미", "영어" }, new[] { "zh", "중", "중국어" },
        new[] { "ja", "일", "일본어" }, new[] { "ru", "러", "러시아어" }, new[] { "he", "이", "히브리어" },
        new[] { "pl", "폴", "폴란드어" },
    };

    static string FilePath { get { return Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "data", "config.json"); } }

    static Dictionary<string, object> Load()
    {
        try
        {
            if (File.Exists(FilePath)) return json.DeserializeObject(File.ReadAllText(FilePath, Encoding.UTF8)) as Dictionary<string, object>;
        }
        catch (Exception) { /* 틀린 사본 — 기본값 */ }
        return null;
    }

    // 새로 받아 바뀌었으면 사본을 갈아 끼우고 true. 받은 글이 JSON 객체가 아니면 버린다.
    public static bool Refresh()
    {
        string text;
        using (System.Net.WebClient wc = new System.Net.WebClient())
        {
            wc.Encoding = Encoding.UTF8;
            wc.Headers["User-Agent"] = "th-korean-helper";
            text = wc.DownloadString(Url);
        }
        if (!(json.DeserializeObject(text) is Dictionary<string, object>)) return false;
        string old = File.Exists(FilePath) ? File.ReadAllText(FilePath, Encoding.UTF8) : "";
        if (old == text) return false;
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
        File.WriteAllText(FilePath, text, new UTF8Encoding(false));
        return true;
    }

    public static List<string> ExtensionIds()
    {
        List<string> ids = new List<string>();
        Dictionary<string, object> c = Load();
        Dictionary<string, object> h = c != null && c.ContainsKey("helper") ? c["helper"] as Dictionary<string, object> : null;
        object[] list = h != null && h.ContainsKey("extensionIds") ? h["extensionIds"] as object[] : null;
        if (list != null) foreach (object o in list) { string s = o as string; if (s != null && IdRe.IsMatch(s)) ids.Add(s); }
        return ids;
    }

    // { id, 단추 글자, 이름 } — 태국어는 늘 둔다(메신저·LINE 받기가 기대어 있다).
    public static string[][] Languages()
    {
        List<string[]> out_ = new List<string[]>();
        Dictionary<string, object> c = Load();
        object[] list = c != null && c.ContainsKey("languages") ? c["languages"] as object[] : null;
        if (list != null)
        {
            foreach (object o in list)
            {
                Dictionary<string, object> l = o as Dictionary<string, object>;
                if (l == null) continue;
                string id = l.ContainsKey("id") ? l["id"] as string : null, label = l.ContainsKey("label") ? l["label"] as string : null,
                    name = l.ContainsKey("name") ? l["name"] as string : null;
                if (id == null || !LangRe.IsMatch(id) || string.IsNullOrEmpty(label) || label.Length > 3 || string.IsNullOrEmpty(name) || name.Length > 20) continue;
                if (out_.Exists(x => x[0] == id)) continue;
                out_.Add(new[] { id, label, name });
            }
        }
        if (out_.Count == 0) return DefaultLangs;
        if (!out_.Exists(x => x[0] == "th")) out_.Insert(0, DefaultLangs[0]);
        return out_.ToArray();
    }
}
