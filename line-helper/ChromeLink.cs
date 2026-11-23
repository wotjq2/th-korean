// 크롬 '멀티 번역기' 확장과 잇기 — 크롬의 네이티브 메시징.
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
using System.Windows.Automation;
using System.Windows.Forms;
using Microsoft.Win32;

static class ChromeLink
{
    public const string HostName = "com.th_korean.helper";
    // 이 exe 를 부를 수 있는 확장. 압축해제로 불러온 멀티 번역기(extension/build.js 의 DEV_KEY 로 고정한 id)와,
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

    static Stream output;
    static readonly object outLock = new object();

    public static void Run(string mutexName, string quitName)
    {
        Stream input = Console.OpenStandardInput();
        output = Console.OpenStandardOutput();
        while (true)
        {
            byte[] head = ReadExactly(input, 4);
            if (head == null) return;
            int n = BitConverter.ToInt32(head, 0);
            if (n <= 0 || n > (8 << 20)) return;
            byte[] body = ReadExactly(input, n);
            if (body == null) return;
            Dictionary<string, object> req;
            try { req = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body)); }
            catch { req = new Dictionary<string, object>(); }
            object t;
            // 번역 다리: 크롬 내장 번역기의 답 — 기다리는 엔진에 돌려준다(MtBridge)
            if (req.TryGetValue("t", out t) && Convert.ToString(t) == "mt-res") { MtBridge.FromChrome(req); continue; }
            Dictionary<string, object> res;
            try { res = Handle(req, mutexName, quitName); }
            catch (Exception e) { res = Reply(false, IsRunning(mutexName)); res["error"] = e.Message; }
            Send(res);
        }
    }

    // 크롬에 메시지 하나(번역 다리는 여러 스레드가 보낸다). 크롬은 한 번에 1MB 까지만 받는다.
    public static bool Send(Dictionary<string, object> m)
    {
        byte[] o = Encoding.UTF8.GetBytes(json.Serialize(m));
        if (o.Length > (1 << 20)) return false;
        lock (outLock)
        {
            try
            {
                output.Write(BitConverter.GetBytes(o.Length), 0, 4);
                output.Write(o, 0, o.Length);
                output.Flush();
                return true;
            }
            catch (IOException) { Environment.Exit(0); return false; } // 크롬이 통로를 닫았다
        }
    }

    static Dictionary<string, object> Handle(Dictionary<string, object> req, string mutexName, string quitName)
    {
        object v;
        string cmd = req.TryGetValue("cmd", out v) ? Convert.ToString(v) : "";
        bool manual = req.TryGetValue("manual", out v) && v is bool && (bool)v;
        // 확장은 부를 때마다 '내 언어'를 같이 보낸다(background.js) — 바뀌었으면 data\mylang.txt 에 적고, 켜져 있는
        // 도우미가 2초 안에 알아채 그 언어로 바꾼다(MyLang.Poll). cmd 'lang' 은 이것만 하러 온 것(창에서 언어를 바꿨다).
        if (req.TryGetValue("lang", out v))
            MyLang.Save(Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "data"), Convert.ToString(v));
        if (cmd == "lang") return Reply(true, IsRunning(mutexName));
        if (cmd == "mt-bridge")
        {
            // 확장이 열어 둔 통로(connectNative) — 이 프로세스는 크롬이 통로를 닫을 때까지 남아 엔진의 번역을 크롬에 잇는다.
            // 트레이 앱이 꺼져 있으면 잇지 않는다(확장이 나중에 다시 연다).
            bool on = IsRunning(mutexName);
            if (on)
            {
                Log.FilePath = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "data", "line-helper.log");
                if (MtBridge.Start(mutexName)) Log.Write("번역 다리: 크롬과 이었습니다(구글이 막히면 크롬 내장 번역기로)");
            }
            Dictionary<string, object> r = Reply(true, on);
            r["bridge"] = 1;
            return r;
        }
        if (cmd == "cc-translate")
        {
            // 크롬 '실시간 번역' 켜기·끄기 — 확장이 크롬 설정(접근성)을 작은 창으로 열어 두면 그 단추를 눌러 준다
            // (확장은 크롬 설정을 바꿀 수 없다). 답의 state = 누른 뒤 상태(on/off), 단추를 못 찾으면 ''.
            bool on = req.TryGetValue("on", out v) && v is bool && (bool)v;
            string state = ChromeCaptionSwitch.SetTranslate(on, 10000);
            Dictionary<string, object> r = Reply(state == (on ? "on" : "off"), IsRunning(mutexName));
            r["state"] = state;
            if (state == "") r["error"] = "크롬 설정에서 '실시간 번역' 단추를 찾지 못했습니다";
            return r;
        }
        if (cmd == "cc-reset")
        {
            // 크롬 '실시간 자막' 껐다 켜기 — 자막 창이 닫혀 멈춘 크롬을 되살린다(LiveCaption.CheckDead). 같은 설정 창에서.
            string state = ChromeCaptionSwitch.ResetCaption(10000);
            Dictionary<string, object> r = Reply(state == "on", IsRunning(mutexName));
            r["state"] = state;
            if (state == "") r["error"] = "크롬 설정에서 '실시간 자막' 단추를 찾지 못했습니다";
            return r;
        }
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
            m["description"] = "번역 도우미 — 멀티 번역기 확장에서 켜고 끄기";
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

// ---------------------------------------------------------------------------
// 번역 다리(2026-11-23) — 구글이 막히거나 인터넷이 안 될 때 엔진이 크롬 내장 번역기(이 PC 안에서 번역)를 빌려 쓴다.
// 확장(background.js)이 크롬을 켤 때 connectNative 로 이 exe 를 띄워 두고 {"cmd":"mt-bridge"} 를 보내면, 이 사용자만 열 수 있는
// named pipe(PipeName)를 연다. 트레이 앱의 엔진(engine.js installBridge)은 그 pipe 에 한 줄에 JSON 하나씩 묻고
//   {"id":3,"op":"tr","from":"th","to":"ko","text":"สวัสดี"}  → {"id":3,"ok":true,"out":"안녕하세요"}
// 여기서는 번호만 바꿔 크롬에 {"t":"mt",...} 로 보내고, 확장의 답 {"t":"mt-res",...} 을 물은 엔진에 돌려준다.
// 일(op)은 avail·create·tr·avail-ld·create-ld·detect 만 — 확장도 그것만 한다. 트레이 앱이 30초 넘게 꺼져 있으면 끝난다
// (작업 관리자에 혼자 남지 않게 — 업데이트로 다시 켜지는 몇 초는 기다린다). 크롬이 꺼지면 통로가 닫혀 같이 끝난다.
// ---------------------------------------------------------------------------
static class MtBridge
{
    // 엔진도 이 이름을 쓴다(Engine.Start 가 TH_MT_PIPE 로 넘긴다). 사용자마다 다르게(한 PC 를 여럿이 써도 남의 크롬에 붙지 않게).
    public static string PipeName { get { return "th-korean-mt-" + System.Security.Principal.WindowsIdentity.GetCurrent().User.Value; } }
    static readonly string[] Ops = { "avail", "create", "tr", "avail-ld", "create-ld", "detect" };
    const int MaxLine = 256 * 1024;

    class Client
    {
        public System.IO.Pipes.NamedPipeServerStream Pipe;
        public readonly object Lk = new object();
    }

    static readonly object lk = new object();
    static readonly Dictionary<int, KeyValuePair<Client, object>> wait = new Dictionary<int, KeyValuePair<Client, object>>();
    static int next;
    static bool started;
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    // 처음 부를 때만 열고 true
    public static bool Start(string trayMutex)
    {
        lock (lk)
        {
            if (started) return false;
            started = true;
        }
        new Thread(Accept) { IsBackground = true }.Start();
        new Thread(delegate ()
        {
            int gone = 0;
            while (true)
            {
                Thread.Sleep(5000);
                gone = ChromeLink.IsRunning(trayMutex) ? 0 : gone + 5;
                if (gone >= 30) Environment.Exit(0);
            }
        }) { IsBackground = true }.Start();
        return true;
    }

    static System.IO.Pipes.PipeSecurity Security()
    {
        System.IO.Pipes.PipeSecurity s = new System.IO.Pipes.PipeSecurity();
        s.AddAccessRule(new System.IO.Pipes.PipeAccessRule(System.Security.Principal.WindowsIdentity.GetCurrent().User,
            System.IO.Pipes.PipeAccessRights.FullControl, System.Security.AccessControl.AccessControlType.Allow));
        // 다른 PC 에서 네트워크로 여는 것은 막는다
        s.AddAccessRule(new System.IO.Pipes.PipeAccessRule(new System.Security.Principal.SecurityIdentifier(System.Security.Principal.WellKnownSidType.NetworkSid, null),
            System.IO.Pipes.PipeAccessRights.FullControl, System.Security.AccessControl.AccessControlType.Deny));
        return s;
    }

    static void Accept()
    {
        int fails = 0;
        while (true)
        {
            System.IO.Pipes.NamedPipeServerStream p;
            try
            {
                p = new System.IO.Pipes.NamedPipeServerStream(PipeName, System.IO.Pipes.PipeDirection.InOut,
                    System.IO.Pipes.NamedPipeServerStream.MaxAllowedServerInstances, System.IO.Pipes.PipeTransmissionMode.Byte,
                    System.IO.Pipes.PipeOptions.Asynchronous, 65536, 65536, Security()); // 비동기: 읽기를 기다리는 동안에도 답을 쓸 수 있게(동기 통로는 읽기·쓰기를 한 줄로 세운다)
                fails = 0;
            }
            catch (Exception e)
            {
                if (++fails == 1) Log.Write("번역 다리: 통로를 못 열었습니다 — " + e.Message);
                Thread.Sleep(5000);
                continue;
            }
            try { p.WaitForConnection(); }
            catch { p.Dispose(); Thread.Sleep(1000); continue; }
            Client c = new Client { Pipe = p };
            new Thread(delegate () { Serve(c); }) { IsBackground = true }.Start();
        }
    }

    static void Serve(Client c)
    {
        try
        {
            using (StreamReader r = new StreamReader(c.Pipe, new UTF8Encoding(false), false, 65536, true))
            {
                string line;
                while ((line = r.ReadLine()) != null)
                {
                    if (line.Length == 0 || line.Length > MaxLine) continue;
                    Dictionary<string, object> q;
                    try { q = json.Deserialize<Dictionary<string, object>>(line); }
                    catch { continue; }
                    object id, op;
                    if (q == null || !q.TryGetValue("id", out id) || !q.TryGetValue("op", out op) || Array.IndexOf(Ops, Convert.ToString(op)) < 0) continue;
                    int g;
                    lock (lk)
                    {
                        g = ++next;
                        wait[g] = new KeyValuePair<Client, object>(c, id);
                    }
                    Dictionary<string, object> m = new Dictionary<string, object>();
                    m["t"] = "mt";
                    m["id"] = g;
                    m["op"] = Convert.ToString(op);
                    foreach (string k in new[] { "from", "to", "text" })
                    {
                        object v;
                        if (q.TryGetValue(k, out v) && v is string) m[k] = v;
                    }
                    if (!ChromeLink.Send(m))
                    {
                        lock (lk) wait.Remove(g);
                        Answer(c, new Dictionary<string, object> { { "id", id }, { "ok", false }, { "error", "too big" } });
                    }
                }
            }
        }
        catch (Exception) { /* 엔진이 끊었다 */ }
        finally
        {
            lock (lk)
            {
                List<int> mine = new List<int>();
                foreach (KeyValuePair<int, KeyValuePair<Client, object>> w in wait) if (w.Value.Key == c) mine.Add(w.Key);
                foreach (int g in mine) wait.Remove(g);
            }
            try { c.Pipe.Dispose(); } catch { }
        }
    }

    // 확장의 답 → 물은 엔진에(그 엔진의 번호로)
    public static void FromChrome(Dictionary<string, object> res)
    {
        object v;
        if (!res.TryGetValue("id", out v)) return;
        int g;
        try { g = Convert.ToInt32(v); } catch { return; }
        KeyValuePair<Client, object> w;
        lock (lk)
        {
            if (!wait.TryGetValue(g, out w)) return;
            wait.Remove(g);
        }
        Dictionary<string, object> a = new Dictionary<string, object>();
        foreach (KeyValuePair<string, object> kv in res) if (kv.Key != "t" && kv.Key != "id") a[kv.Key] = kv.Value;
        a["id"] = w.Value;
        Answer(w.Key, a);
    }

    static void Answer(Client c, Dictionary<string, object> a)
    {
        byte[] b = new UTF8Encoding(false).GetBytes(json.Serialize(a) + "\n");
        lock (c.Lk)
        {
            try { c.Pipe.Write(b, 0, b.Length); c.Pipe.Flush(); }
            catch (Exception) { /* 엔진이 끊었다 */ }
        }
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
        // config.json 과 같은 목록 — 처음 깐 도우미가 원격 설정을 받기 전에 쓴다(예전 7개 그대로였다, 2026-11-04).
        new[] { "th", "태", "태국어" }, new[] { "en", "미", "영어" }, new[] { "zh", "중", "중국어" },
        new[] { "hi", "힌", "힌디어" }, new[] { "es", "스", "스페인어" }, new[] { "ar", "아", "아랍어" },
        new[] { "fr", "프", "프랑스어" }, new[] { "bn", "벵", "벵골어" }, new[] { "pt", "포", "포르투갈어" },
        new[] { "ru", "러", "러시아어" }, new[] { "ur", "우", "우르두어" }, new[] { "id", "인", "인도네시아어" },
        new[] { "de", "독", "독일어" }, new[] { "ja", "일", "일본어" }, new[] { "mr", "마", "마라티어" },
        new[] { "te", "텔", "텔루구어" }, new[] { "tr", "터", "튀르키예어" }, new[] { "ta", "타", "타밀어" },
        new[] { "yue", "광", "광둥어" }, new[] { "vi", "베", "베트남어" }, new[] { "he", "이", "히브리어" },
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

    // helper.liveTranslate.toggle / page — 크롬 설정의 '실시간 번역' 단추 이름, 설정 창 제목의 앞부분(크롬 한국어·영어판).
    // 크롬이 이름을 바꾸면 config.json 만 고친다.
    public static string[] LiveTranslateNames() { return Strings("toggle", new[] { "실시간 번역", "자막 번역", "Live translate", "Live Translate" }); }
    public static string[] LiveCaptionNames() { return Strings("captionToggle", new[] { "실시간 자막", "Live Caption", "Live caption" }); }
    public static string[] SettingsPageNames() { return Strings("page", new[] { "설정", "Settings" }); }
    // helper.liveTranslate.notes — 크롬 '실시간 번역' 이 자막에 붙이는 괄호 설명에 드는 낱말. 이 낱말이 든 괄호는 영상에 띄우지 않는다.
    public static string[] CaptionNoteWords()
    {
        return Strings("notes", new[] { "불완전", "아마도", "나머지", "텍스트", "원문", "번역", "문맥", "맥락", "문장", "추측", "불분명", "알아들", "들리지",
            "incomplete", "unclear", "probably", "the rest", "translat", "text" });
    }

    static string[] Strings(string key, string[] fallback)
    {
        Dictionary<string, object> c = Load();
        Dictionary<string, object> h = c != null && c.ContainsKey("helper") ? c["helper"] as Dictionary<string, object> : null;
        Dictionary<string, object> lt = h != null && h.ContainsKey("liveTranslate") ? h["liveTranslate"] as Dictionary<string, object> : null;
        object[] list = lt != null && lt.ContainsKey(key) ? lt[key] as object[] : null;
        List<string> out_ = new List<string>();
        if (list != null) foreach (object o in list) { string s = o as string; if (!string.IsNullOrEmpty(s) && s.Length <= 40) out_.Add(s); }
        return out_.Count > 0 ? out_.ToArray() : fallback;
    }

    // report — '문제 알리기' 가 여는 새 글 화면(확장과 같은 칸, config.json _report). { 주소, 제목 칸, 본문 칸 }. 틀리면 GitHub 이슈.
    public static string[] ReportTarget()
    {
        string[] def = { "https://github.com/wotjq2/th-korean/issues/new", "title", "body" };
        Dictionary<string, object> c = Load();
        Dictionary<string, object> r = c != null && c.ContainsKey("report") ? c["report"] as Dictionary<string, object> : null;
        if (r == null) return def;
        System.Text.RegularExpressions.Regex urlRe = new System.Text.RegularExpressions.Regex("^https://[^\\s\"'<>\\\\]{6,290}$");
        System.Text.RegularExpressions.Regex paramRe = new System.Text.RegularExpressions.Regex("^[\\w.-]{1,40}$");
        string url = r.ContainsKey("url") ? r["url"] as string : null;
        if (url == null || !urlRe.IsMatch(url)) return def;
        string title = r.ContainsKey("titleParam") ? r["titleParam"] as string : null;
        string body = r.ContainsKey("bodyParam") ? r["bodyParam"] as string : null;
        return new[] {
            url,
            title == "" ? "" : (title != null && paramRe.IsMatch(title) ? title : def[1]),
            body != null && paramRe.IsMatch(body) ? body : def[2],
        };
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

// 크롬 설정 › 접근성의 켜기·끄기 단추를 UI Automation 으로 찾아 누른다. 확장이 설정을 탭으로 열어 두고 부른다.
// 설정 창이 뜰 때까지 timeoutMs 동안 다시 본다. 돌려주는 것: 누른 뒤 상태 "on"/"off", 못 찾으면 "".
static class ChromeCaptionSwitch
{
    // '실시간 번역'(멀티 번역기 창의 '크롬 실시간 번역' 칸 — 사용자 2026-11-03: 한국어 영상만 볼 때 끄고, 외국어 영상에서 켜고 싶다).
    public static string SetTranslate(bool on, int timeoutMs)
    {
        TogglePattern t = Find(RemoteConfig.LiveTranslateNames(), timeoutMs);
        return t == null ? "" : Flip(t, on);
    }

    // '실시간 자막' 을 껐다 켠다(멀티 번역기 창의 '크롬 실시간 자막 고치기'). 크롬은 끌 때 자막 창을 치우고 켤 때 새로 만든다
    // (2026-11-04 시험 크롬) — 닫혀 버린 자막 창이 되살아난다. 돌려주는 것: 다시 켠 뒤 상태, 못 찾으면 "".
    public static string ResetCaption(int timeoutMs)
    {
        TogglePattern t = Find(RemoteConfig.LiveCaptionNames(), timeoutMs);
        if (t == null) return "";
        Flip(t, false);
        Thread.Sleep(700); // 크롬이 자막 기능을 내릴 틈
        return Flip(t, true);
    }

    static string Flip(TogglePattern t, bool on)
    {
        if ((t.Current.ToggleState == ToggleState.On) != on) t.Toggle();
        for (int i = 0; i < 10 && (t.Current.ToggleState == ToggleState.On) != on; i++) Thread.Sleep(100);
        return t.Current.ToggleState == ToggleState.On ? "on" : "off";
    }

    static TogglePattern Find(string[] names, int timeoutMs)
    {
        string[] pages = RemoteConfig.SettingsPageNames();
        Condition chrome = new PropertyCondition(AutomationElement.ClassNameProperty, "Chrome_WidgetWin_1");
        DateTime end = DateTime.Now.AddMilliseconds(timeoutMs);
        while (DateTime.Now < end)
        {
            foreach (AutomationElement w in AutomationElement.RootElement.FindAll(TreeScope.Children, chrome))
            {
                string title = w.Current.Name ?? "";
                if (!Array.Exists(pages, p => title.StartsWith(p))) continue; // 설정 창만(다른 창의 큰 페이지는 뒤지지 않는다)
                foreach (string n in names)
                {
                    // 같은 이름의 단추가 여럿이면 켜기·끄기가 되는 것을 쓴다.
                    foreach (AutomationElement b in w.FindAll(TreeScope.Descendants, new AndCondition(
                        new PropertyCondition(AutomationElement.NameProperty, n),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))))
                    {
                        object pat;
                        if (b.TryGetCurrentPattern(TogglePattern.Pattern, out pat)) return (TogglePattern)pat;
                    }
                }
            }
            Thread.Sleep(300);
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// 문제 알리기 (2026-11-22) — 트레이 메뉴. 확장의 '문제 알리기' 와 같은 곳(config.json report, 기본 GitHub 이슈)에 같은 꼴의 글.
// 기록(line-helper.log)에는 LINE 에서 보낸·받은 말, 화면 글줄, 창 제목이 그대로 있다 — 공개 글에 대화가 나가지 않게 오류 줄만
// 고르고, 대화·화면 글·창 제목을 적는 줄은 오류여도 넣지 않으며, 남은 줄의 [ ] 안도 가린다. 사용자 폴더 경로(이름이 든다)도 가린다.
// 윈도우는 긴 주소를 잘 못 연다(ShellExecute 2천 자 남짓) — 글은 클립보드에 넣고 새 글 화면에서 붙여 넣게 한다(올리기 전에 보인다).
// ---------------------------------------------------------------------------
static class Report
{
    static readonly System.Text.RegularExpressions.Regex ErrorLine = new System.Text.RegularExpressions.Regex(
        "실패|오류|못 |못했|못 찾|없습니다|Exception|error|failed", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    // 대화·화면 글·창 제목이 드는 줄 — 오류여도 넣지 않는다('입력칸 바꾸기 실패 [보낼 말] → 번역' 은 번역이 괄호 밖에 있다)
    static readonly System.Text.RegularExpressions.Regex Private = new System.Text.RegularExpressions.Regex(
        @"보냄 \[|받음 \[|말풍선|입력칸 바꾸기 실패|창이 바뀌어|화면 글줄|화면 번역 켬|화면 번역: 뗌|다른 창으로|\[평가\]|\[화면\]|\[hs\]|클립보드");
    static readonly System.Text.RegularExpressions.Regex Bracket = new System.Text.RegularExpressions.Regex(@"\[(?!엔진\]|통합 번역\]|멀티 번역기\])[^\]\r\n]{0,400}\]");
    static readonly System.Text.RegularExpressions.Regex Stamp = new System.Text.RegularExpressions.Regex(@"^(\d\d-\d\d \d\d:\d\d):\d\d\.\d{3} ");

    // 기록 끝쪽에서 오류 줄을 골라 가린다. 같은 말이 잇따르면 한 줄(×횟수).
    public static List<string> ErrorLines(string logPath, int max)
    {
        List<string> outLines = new List<string>();
        string[] all;
        try
        {
            using (FileStream fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (StreamReader sr = new StreamReader(fs, Encoding.UTF8))
                all = sr.ReadToEnd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
        }
        catch { return outLines; }
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string lastMsg = null;
        int count = 0;
        for (int i = Math.Max(0, all.Length - 3000); i < all.Length; i++)
        {
            System.Text.RegularExpressions.Match m = Stamp.Match(all[i]);
            if (!m.Success) continue; // 오류의 둘째 줄부터(호출 순서)는 넣지 않는다
            string msg = all[i].Substring(m.Length);
            if (!ErrorLine.IsMatch(msg) || Private.IsMatch(msg)) continue;
            msg = Bracket.Replace(msg, "[…]");
            if (!string.IsNullOrEmpty(home)) msg = msg.Replace(home, "%USERPROFILE%");
            msg = msg.Replace("@", "@\u200b"); // GitHub '@이름' 알림 막기
            if (msg.Length > 200) msg = msg.Substring(0, 199) + "…";
            if (msg == lastMsg && outLines.Count > 0)
            {
                count++;
                outLines[outLines.Count - 1] = "- " + m.Groups[1].Value + " " + msg + " (×" + count + ")";
                continue;
            }
            lastMsg = msg;
            count = 1;
            outLines.Add("- " + m.Groups[1].Value + " " + msg);
        }
        if (outLines.Count > max) outLines.RemoveRange(0, outLines.Count - max);
        return outLines;
    }

    // 기록의 마지막 '엔진 준비: 스크립트 1.35.8' 줄 → 판 번호
    static string ScriptVersion(string logPath)
    {
        try
        {
            string text;
            using (FileStream fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (StreamReader sr = new StreamReader(fs, Encoding.UTF8)) text = sr.ReadToEnd();
            System.Text.RegularExpressions.MatchCollection ms = System.Text.RegularExpressions.Regex.Matches(text, @"엔진 준비: 스크립트 (\S+)");
            if (ms.Count > 0) return ms[ms.Count - 1].Groups[1].Value;
        }
        catch { }
        return "?";
    }

    static string WindowsName()
    {
        try
        {
            using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
            {
                string build = Convert.ToString(k.GetValue("CurrentBuild"));
                string name = Convert.ToString(k.GetValue("ProductName"));
                int b;
                // 윈도우 11 도 ProductName 은 'Windows 10 …' 으로 남아 있다 — 빌드 22000 부터 11
                if (int.TryParse(build, out b) && b >= 22000) name = name.Replace("Windows 10", "Windows 11");
                return name + " " + Convert.ToString(k.GetValue("DisplayVersion")) + " (빌드 " + build + ")";
            }
        }
        catch { return Environment.OSVersion.VersionString; }
    }

    public static string Body(string logPath, string myLang, string lineLang, string screenLang, List<string> ocrLangs)
    {
        StringBuilder b = new StringBuilder();
        b.Append("### 무슨 일인가요?\n(여기에 적어 주세요 — 어느 프로그램에서, 무엇을 했더니, 어떻게 됐는지)\n\n");
        b.Append("### 환경 (번역 도우미)\n");
        b.Append("- 번역 도우미: 프로그램 ").Append(File.GetLastWriteTime(Application.ExecutablePath).ToString("yyyy-MM-dd HH:mm"))
            .Append(" 만듦 · 번역 스크립트 ").Append(ScriptVersion(logPath)).Append('\n');
        b.Append("- 윈도우: ").Append(WindowsName()).Append(Environment.Is64BitOperatingSystem ? " 64비트" : " 32비트")
            .Append(" · 화면 언어 ").Append(System.Globalization.CultureInfo.CurrentUICulture.Name).Append('\n');
        b.Append("- 내 언어: ").Append(myLang).Append(" · LINE 보낼 때 바꿀 언어: ").Append(lineLang == "" ? "끔" : lineLang)
            .Append(" · 화면 번역 글자: ").Append(screenLang).Append('\n');
        b.Append("- 윈도우 글자 인식 언어: ").Append(ocrLangs.Count > 0 ? string.Join(", ", ocrLangs.ToArray()) : "없음").Append('\n');
        List<string> errs = ErrorLines(logPath, 20);
        b.Append("\n### 최근 오류 기록 (이 PC, ").Append(errs.Count).Append("개 — 대화 글은 넣지 않음)\n");
        if (errs.Count == 0) b.Append("- 없음\n");
        foreach (string e in errs) b.Append(e).Append('\n');
        return b.ToString();
    }

    // 트레이 메뉴 '문제 알리기' — 글을 클립보드에 넣고 새 글 화면을 연다.
    public static void Open(string body)
    {
        bool copied = false;
        for (int i = 0; i < 5 && !copied; i++)
        {
            try { Clipboard.SetText(body, TextDataFormat.UnicodeText); copied = true; }
            catch (System.Runtime.InteropServices.ExternalException) { Thread.Sleep(40); }
        }
        string[] t = RemoteConfig.ReportTarget();
        string sep = t[0].Contains("?") ? "&" : "?";
        string url = t[0] + sep + (t[1] != "" ? t[1] + "=" + Uri.EscapeDataString("[도우미] ") + "&" : "")
            + t[2] + "=" + Uri.EscapeDataString(copied ? "(복사해 둔 글을 Ctrl+V 로 붙여 넣고, 맨 위에 무슨 일인지 적어 주세요)" : "(글을 복사하지 못했습니다 — 무슨 일인지 적어 주세요)");
        try { Process.Start(url); } catch (Exception e) { Log.Write("문제 알리기: 브라우저를 열지 못했습니다 — " + e.Message); }
        App.Show("문제 알리기", copied
            ? "보낼 글을 복사해 두었습니다. 열린 GitHub 화면의 글 칸을 지우고 Ctrl+V 로 붙여 넣은 뒤 무슨 일인지 적어 올려 주세요(GitHub 계정 필요). 계정이 없으면 메일·메신저에 붙여 넣어 보내 주세요."
            : "글을 복사하지 못했습니다. 열린 화면에 무슨 일인지 적어 주세요.", !copied, 15000);
    }
}
