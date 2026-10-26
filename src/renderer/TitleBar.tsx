import mark from "./assets/mark.png";

/** Faixa de título desenhada pelo app. Os botões minimizar/maximizar/fechar são do Windows (sobrepostos à direita). */
export function TitleBar() {
  return (
    <div className="titlebar">
      <img className="titlebar-logo" src={mark} alt="" />
      <span className="titlebar-text">GitMonster</span>
    </div>
  );
}
