import { useEffect, useState } from "react";

export type AuthMode = "login" | "register";

type Credentials = {
  email: string;
  username: string;
  password: string;
};

type AccountDialogProps = {
  mode: AuthMode;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: Credentials) => void;
};

export function AccountDialog({ mode, isSubmitting, error, onClose, onModeChange, onSubmit }: AccountDialogProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [mode]);

  const isRegister = mode === "register";

  return (
    <div className="account-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
        <p className="section-kicker">Anitabia ID</p>
        <h1 id="account-dialog-title">{isRegister ? "Создать аккаунт" : "Войти в профиль"}</h1>
        <p className="account-dialog__lead">{isRegister ? "Сохраняйте избранное и историю просмотра." : "Продолжайте смотреть с того места, где остановились."}</p>
        <form
          className="account-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ email, username, password });
          }}
        >
          {isRegister ? (
            <label>
              <span>Имя в профиле</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} required autoComplete="nickname" />
            </label>
          ) : null}
          <label>
            <span>E-mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" />
          </label>
          <label>
            <span>Пароль</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} autoComplete={isRegister ? "new-password" : "current-password"} />
          </label>
          {error ? <p className="account-form__error" role="alert">{error}</p> : null}
          <button className="watch-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Подождите…" : isRegister ? "Создать аккаунт" : "Войти"}</button>
          {isRegister ? (
            <p className="account-form__legal">
              Создавая аккаунт, вы принимаете <a href="/terms">Условия использования</a> и
              подтверждаете ознакомление с <a href="/privacy">Политикой конфиденциальности</a>.
            </p>
          ) : null}
        </form>
        <p className="account-dialog__switch">
          {isRegister ? "Уже есть аккаунт?" : "Впервые на Anitabia?"}{" "}
          <button type="button" onClick={() => onModeChange(isRegister ? "login" : "register")}>{isRegister ? "Войти" : "Создать аккаунт"}</button>
        </p>
      </section>
    </div>
  );
}
