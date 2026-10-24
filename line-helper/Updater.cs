// 번역 도우미가 스스로 새 판으로 바꾸기. GitHub(wotjq2/th-korean)의 line-helper 폴더 파일과 이 폴더 파일을
// git 의 파일 지문(blob sha)으로 견줘 바뀐 파일만 받는다.
//  - 소스(.cs·build.ps1)가 바뀌면 새 exe 를 옆에 만들고, 지금 exe 를 .old.exe 로 비킨 뒤(돌고 있는 exe 도 이름은
//    바꿀 수 있다) 새 것을 그 이름에 놓고 --wait 로 켠 다음 이 판은 끝낸다. 새 판은 이 판이 끝나기를 기다렸다 켜진다.
//  - package.json 이 바뀌면 npm install, engine.js·ocr-worker.js 만 바뀌면 엔진만 다시 띄운다.
// 켜고 1분 뒤, 그 뒤로 6시간마다 본다. 트레이 메뉴 '업데이트 확인' 으로 바로 볼 수도 있다.
// 개발하는 저장소 안(위쪽에 .git 이 있는 곳)에서는 하지 않는다 — 고치던 파일을 GitHub 판으로 덮으면 안 된다.
// 처음 설치는 install.ps1(명령 한 줄)이 한다.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Updater
{
    const string Repo = "wotjq2/th-korean";
    const string Folder = "line-helper";
    static string dir;
    static Engine engine;
    static bool dev;
    static int busy;
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    public static void Start(string appDir, Engine e)
    {
        dir = appDir;
        engine = e;
        try { File.Delete(OldExe); } catch { } // 지난번에 갈아 끼우고 남은 판
        for (DirectoryInfo d = new DirectoryInfo(dir); d != null && !dev; d = d.Parent)
            dev = Directory.Exists(Path.Combine(d.FullName, ".git"));
        if (dev) { Log.Write("업데이트: 저장소 안의 개발판이라 스스로 바꾸지 않습니다"); return; }
        new Thread(delegate ()
        {
            Thread.Sleep(60 * 1000);
            while (true)
            {
                Check(false);
                Thread.Sleep(6 * 3600 * 1000);
            }
        }) { IsBackground = true }.Start();
    }

    static string Exe { get { return Application.ExecutablePath; } }
    static string OldExe { get { return Path.Combine(Path.GetDirectoryName(Exe), Path.GetFileNameWithoutExtension(Exe) + ".old.exe"); } }

    // manual: 트레이에서 누른 것 — 결과를 알린다.
    public static void Check(bool manual)
    {
        if (dev)
        {
            if (manual) App.Show("업데이트", "개발판(저장소 안)이라 스스로 바꾸지 않습니다", false, 4000);
            return;
        }
        if (Interlocked.Exchange(ref busy, 1) == 1) return;
        try { Run(manual); }
        catch (Exception e)
        {
            Log.Write("업데이트 확인 실패: " + e.Message);
            if (manual) App.Show("업데이트 확인 실패", e.Message, true, 6000);
        }
        finally { busy = 0; }
    }

    static void Run(bool manual)
    {
        ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; // TLS 1.2 (GitHub)
        object[] list = (object[])json.DeserializeObject(Get("https://api.github.com/repos/" + Repo + "/contents/" + Folder + "?ref=main"));
        List<string> changed = new List<string>();
        foreach (object o in list)
        {
            Dictionary<string, object> f = (Dictionary<string, object>)o;
            if ((string)f["type"] != "file") continue;
            string name = (string)f["name"], sha = (string)f["sha"], local = Path.Combine(dir, name);
            if (File.Exists(local) && BlobSha(File.ReadAllBytes(local)) == sha) continue;
            // 지문으로 받아야 GitHub raw 의 몇 분 늦은 사본을 새 판으로 잘못 적지 않는다.
            Dictionary<string, object> blob = (Dictionary<string, object>)json.DeserializeObject(Get("https://api.github.com/repos/" + Repo + "/git/blobs/" + sha));
            byte[] data = Convert.FromBase64String(((string)blob["content"]).Replace("\n", ""));
            File.WriteAllBytes(local + ".tmp", data);
            if (File.Exists(local)) File.Delete(local);
            File.Move(local + ".tmp", local);
            changed.Add(name);
        }
        if (changed.Count == 0)
        {
            Log.Write("업데이트: 이미 새 판");
            if (manual) App.Show("업데이트", "이미 새 판입니다", false, 3000);
            return;
        }
        Log.Write("업데이트: 받은 파일 " + string.Join(", ", changed.ToArray()));
        bool source = false, deps = false, eng = false;
        foreach (string n in changed)
        {
            if (n.EndsWith(".cs") || n == "build.ps1") source = true;
            if (n == "package.json" || n == "package-lock.json") deps = true;
            if (n.EndsWith(".js")) eng = true;
        }
        if (deps || eng) engine.Stop(); // 다음 번역 때 새 engine.js·모듈로 다시 뜬다
        if (deps) Shell(Engine.FindNode(), "\"" + NpmCli() + "\" install --omit=dev --no-audit --no-fund", 300000);
        if (!source)
        {
            App.Show("번역 도우미", "새 판으로 바꿨습니다", false, 4000);
            return;
        }
        string fresh = Path.Combine(dir, Path.GetFileNameWithoutExtension(Exe) + ".new.exe");
        try
        {
            if (File.Exists(fresh)) File.Delete(fresh);
            Shell(Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"),
                "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(dir, "build.ps1") + "\" -Out \"" + fresh + "\"", 180000);
            if (!File.Exists(fresh)) throw new Exception("새 exe 가 만들어지지 않았습니다");
        }
        catch
        {
            // 받은 소스를 지워 둔다 — 다음 확인 때 다시 받아 다시 만들어 본다(그때까지는 지금 판을 쓴다).
            foreach (string n in changed) if (n.EndsWith(".cs") || n == "build.ps1") try { File.Delete(Path.Combine(dir, n)); } catch { }
            throw;
        }
        File.Delete(OldExe);
        File.Move(Exe, OldExe);
        File.Move(fresh, Exe);
        Log.Write("업데이트: 새 exe 로 갈아 끼우고 다시 켭니다");
        Process.Start(Exe, "--wait --updated");
        App.Quit();
    }

    static string Get(string url)
    {
        using (WebClient wc = new WebClient())
        {
            wc.Encoding = Encoding.UTF8;
            wc.Headers["User-Agent"] = "th-korean-helper";
            wc.Headers["Accept"] = "application/vnd.github+json";
            return wc.DownloadString(url);
        }
    }

    // git 이 파일마다 매기는 지문: sha1("blob 길이\0" + 내용).
    static string BlobSha(byte[] data)
    {
        byte[] head = Encoding.ASCII.GetBytes("blob " + data.Length + "\0");
        using (SHA1 sha = SHA1.Create())
        {
            sha.TransformBlock(head, 0, head.Length, null, 0);
            sha.TransformFinalBlock(data, 0, data.Length);
            StringBuilder s = new StringBuilder();
            foreach (byte b in sha.Hash) s.Append(b.ToString("x2"));
            return s.ToString();
        }
    }

    static string NpmCli()
    {
        string cli = Path.Combine(Path.GetDirectoryName(Engine.FindNode()), @"node_modules\npm\bin\npm-cli.js");
        if (!File.Exists(cli)) throw new Exception("npm 을 찾지 못했습니다: " + cli);
        return cli;
    }

    static void Shell(string file, string args, int timeoutMs)
    {
        ProcessStartInfo psi = new ProcessStartInfo(file, args);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WorkingDirectory = dir;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        using (Process p = Process.Start(psi))
        {
            string err = "";
            Thread t = new Thread(delegate () { err = p.StandardError.ReadToEnd(); }) { IsBackground = true };
            t.Start();
            string output = p.StandardOutput.ReadToEnd();
            if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } throw new Exception(Path.GetFileName(file) + " 이 너무 오래 걸립니다"); }
            t.Join(2000);
            if (p.ExitCode != 0) throw new Exception(Path.GetFileName(file) + " 실패(" + p.ExitCode + "): " + (output + err).Trim());
        }
    }
}
