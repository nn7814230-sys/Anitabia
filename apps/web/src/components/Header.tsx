import { useEffect, useState } from "react";

import type { AccountUser } from "../types";

type HeaderProps = {
  variant?: "overlay" | "solid";
  onNavigateHome?: () => void;
  user?: AccountUser | null;
  onProfile?: () => void;
  onOpenAuth?: () => void;
  onLogout?: () => void;
};

function scrollToSection(sectionId: string) {
  window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" }), 0);
}

export function Header({ variant = "overlay", onNavigateHome, user, onProfile, onOpenAuth, onLogout }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(() => window.scrollY > 18);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const updateHeader = () => setIsScrolled(window.scrollY > 18);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    setIsMenuOpen(false);
    if (!onNavigateHome) return;

    event.preventDefault();
    onNavigateHome();
    scrollToSection(sectionId);
  };

  return (
    <header className={`site-header site-header--${variant}${variant === "overlay" && isScrolled ? " site-header--scrolled" : ""}`}>
      <div className="site-header__inner">
        <a className="brand" href="#top" aria-label="Anitabia, главная" onClick={(event) => navigate(event, "top")}>
          ani<span>tabia</span>
        </a>
        <nav className={isMenuOpen ? "site-nav is-open" : "site-nav"} aria-label="Основная навигация">
          <a href="#catalog" onClick={(event) => navigate(event, "catalog")}>Каталог</a>
          <a href="#new" onClick={(event) => navigate(event, "new")}>Новинки</a>
          <a href="/calendar" onClick={() => setIsMenuOpen(false)}>Календарь</a>
          <a href="#about" onClick={(event) => navigate(event, "about")}>О проекте</a>
          <a className="support-link" href="https://www.donationalerts.com/r/x_duplix_c">Поддержать автора сайта</a>
        </nav>
        <div className="header-account">
          {user ? (
            <>
              <button type="button" className="account-button" onClick={onProfile}>{user.username}</button>
              <button type="button" className="logout-button" onClick={onLogout}>Выйти</button>
            </>
          ) : <button type="button" className="account-button" onClick={onOpenAuth}>Войти</button>}
        </div>
        <div className="header-mobile-actions">
          <button className="mobile-account-button" type="button" onClick={user ? onProfile : onOpenAuth}>{user ? user.username.slice(0, 1).toUpperCase() : "Войти"}</button>
          <a className="mobile-support-link" href="https://www.donationalerts.com/r/x_duplix_c">Поддержать</a>
          <button
            className="mobile-menu-button"
            type="button"
            aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
