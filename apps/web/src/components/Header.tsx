type HeaderProps = {
  variant?: "overlay" | "solid";
  onNavigateHome?: () => void;
};

function scrollToSection(sectionId: string) {
  window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" }), 0);
}

export function Header({ variant = "overlay", onNavigateHome }: HeaderProps) {
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    if (!onNavigateHome) return;

    event.preventDefault();
    onNavigateHome();
    scrollToSection(sectionId);
  };

  return (
    <header className={`site-header site-header--${variant}`}>
      <a className="brand" href="#top" aria-label="Anitabia, главная" onClick={(event) => navigate(event, "top")}>
        ani<span>tabia</span>
      </a>
      <nav aria-label="Основная навигация">
        <a href="#catalog" onClick={(event) => navigate(event, "catalog")}>Каталог</a>
        <a href="#new" onClick={(event) => navigate(event, "new")}>Новинки</a>
        <a href="#about" onClick={(event) => navigate(event, "about")}>О проекте</a>
      </nav>
      <button className="profile-button" type="button" aria-label="Открыть профиль">◎</button>
    </header>
  );
}
