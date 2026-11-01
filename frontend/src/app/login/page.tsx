"use client";

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, AppConfig } from "@/lib/api";
import { safeNext, saveToken } from "@/lib/auth";
import { IconCaption, IconDoc, IconMeetMark, IconTranslate, IconCheck } from "@/components/Icons";

interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invitedEmail = params.get("email") ?? "";
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setError("Không kết nối được máy chủ"));
  }, []);

  const finish = useCallback(
    (token: string) => {
      saveToken(token);
      router.replace(safeNext(params.get("next")));
    },
    [router, params],
  );

  return (
    <main className="signin">
      <aside className="signin-aside">
        <div className="brand"><IconMeetMark />MeetMind</div>
        <div>
          <h1>Mỗi cuộc họp có phụ đề, tài liệu và biên bản</h1>
          <p>MeetMind chạy cạnh Google Meet: ghi lại ai nói gì, dịch cho từng người xem theo ngôn ngữ của họ, và soạn biên bản khi họp xong.</p>
          <ul className="signin-points">
            <li><IconCaption /><span>Phụ đề trực tiếp kèm tên người nói</span></li>
            <li><IconTranslate /><span>Mỗi người đọc bằng ngôn ngữ mình chọn</span></li>
            <li><IconDoc /><span>Chia sẻ tài liệu và cùng đọc đúng chỗ</span></li>
            <li><IconCheck /><span>Biên bản có quyết định và công việc, dẫn về câu gốc</span></li>
          </ul>
        </div>
        <div className="small" style={{ color: "var(--chrome-muted)" }}>Đăng nhập bằng đúng địa chỉ email đã được mời vào tổ chức.</div>
      </aside>

      <section className="signin-main">
        <div className="signin-card">
          <h1 style={{ marginBottom: 4 }}>Đăng nhập</h1>
          <p className="muted" style={{ margin: "0 0 18px" }}>Dùng tài khoản Google của bạn. Không cần mật khẩu.</p>
          <div className="panel">
            <div className="col" style={{ padding: 18, gap: 14 }}>
              {!config && !error && <div className="muted">Đang tải…</div>}

              {config?.google_client_id && (
                <GoogleSignIn
                  clientId={config.google_client_id}
                  busy={busy}
                  onBusy={setBusy}
                  onError={setError}
                  onToken={finish}
                  hint={invitedEmail}
                />
              )}

              {config?.google_client_id && config.email_code && <div className="muted small" style={{ textAlign: "center" }}>hoặc</div>}

              {config?.email_code && <EmailCodeForm initialEmail={invitedEmail} onToken={finish} onError={setError} />}

              {config && !config.google_client_id && !config.email_code && (
                <div className="error">Chưa cấu hình cách đăng nhập nào. Đặt MEETMIND_GOOGLE_CLIENT_ID cho backend.</div>
              )}
              {error && <div className="error" role="alert">{error}</div>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleSignIn({
  clientId,
  busy,
  onBusy,
  onError,
  onToken,
  hint,
}: {
  clientId: string;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onError: (message: string) => void;
  onToken: (token: string) => void;
  hint: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ready = () => setLoaded(true);
    if (window.google?.accounts) return ready();
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", ready);
    script.addEventListener("error", () => onError("Không tải được dịch vụ đăng nhập của Google. Kiểm tra kết nối mạng."));
    return () => script?.removeEventListener("load", ready);
  }, [onError]);

  useEffect(() => {
    if (!loaded || !holder.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        onBusy(true);
        onError("");
        try {
          onToken((await api.googleLogin(credential)).token);
        } catch (e) {
          onError(e instanceof Error ? e.message : "Không đăng nhập được");
          onBusy(false);
        }
      },
    });
    window.google.accounts.id.renderButton(holder.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: 316,
      locale: "vi",
    });
  }, [loaded, clientId, onBusy, onError, onToken]);

  return (
    <div className="col" style={{ gap: 8 }}>
      {hint && (
        <div className="notice bordered">
          Bạn được mời bằng địa chỉ <strong>{hint}</strong>. Hãy đăng nhập bằng đúng tài khoản Google có địa chỉ này.
        </div>
      )}
      <div ref={holder} style={{ minHeight: 44, display: "flex", justifyContent: "center", opacity: busy ? 0.5 : 1 }} aria-label="Đăng nhập bằng Google" />
    </div>
  );
}

/** Fallback for when Google sign-in is not configured. */
function EmailCodeForm({ initialEmail, onToken, onError }: { initialEmail: string; onToken: (t: string) => void; onError: (m: string) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    onError("");
    try {
      const res = await api.requestCode(email.trim());
      setDevCode(res.dev_code);
      setStep("code");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không gửi được mã");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      onToken((await api.verifyCode(email.trim(), code.trim(), name.trim() || null)).token);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không đăng nhập được");
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form className="col" style={{ gap: 12 }} onSubmit={sendCode}>
        <div className="field">
          <label htmlFor="email">Địa chỉ email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <span className="muted small">Chúng tôi gửi mã xác nhận 6 số tới địa chỉ này.</span>
        </div>
        <button className="btn primary" disabled={busy || !email.trim()}>Gửi mã đăng nhập</button>
      </form>
    );
  }

  return (
    <form className="col" style={{ gap: 12 }} onSubmit={confirm}>
      <div>Mã xác nhận đã được gửi tới <strong>{email}</strong>.</div>
      {devCode && (
        <div className="notice warn bordered">
          Chế độ phát triển, chưa gửi email thật. Mã của bạn là <strong className="num">{devCode}</strong>
        </div>
      )}
      <div className="field">
        <label htmlFor="code">Mã 6 số</label>
        <input
          id="code"
          className="input num"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          style={{ letterSpacing: "0.3em", fontSize: 18 }}
        />
      </div>
      <div className="field">
        <label htmlFor="name">Họ và tên <span className="muted">(lần đầu đăng nhập)</span></label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <button className="btn primary" disabled={busy || code.length !== 6}>Đăng nhập</button>
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={() => { setStep("email"); setCode(""); onError(""); }}>Đổi email</button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={() => sendCode()}>Gửi lại mã</button>
      </div>
    </form>
  );
}
