// Estilos de Bidware y de Fr8Bid en la misma página sin chocar (PostCSS, al
// compilar). Las hojas de Bidware quedan bajo .bw, el contenedor de sus
// pantallas; las de Fr8Bid dejan de aplicar dentro de .bw. Sin especificidad
// extra para Fr8Bid (:where) y sin tocar las variables del :root de las marcas.

const PSEUDO_ELEMENTO = /(::?(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+))+$/i;

// Un selector de Bidware (sin comas de primer nivel) bajo .bw; null = se quita.
export function bajoBidware(selector: string): string | null {
  const s = selector.trim();
  if (s === "#root" || s === "html") return null;
  if (s === ":root" || s === "body") return ".bw";
  if (s === "*") return ".bw, .bw *";
  if (/^(:root|body)(?=[.\[:\s>+~])/.test(s)) return s.replace(/^(:root|body)/, ".bw");
  return `.bw ${s}`;
}

// Un selector de Fr8Bid que no debe alcanzar a las pantallas de Bidware.
export function fueraDeBidware(selector: string): string {
  const s = selector.trim();
  if (/^(:root|html|body)$/.test(s) || /^(:root|html|body)[\s>]*$/.test(s)) return s;
  const m = s.match(PSEUDO_ELEMENTO);
  const corte = m ? s.length - m[0].length : s.length;
  return `${s.slice(0, corte)}:where(:not(.bw *))${s.slice(corte)}`;
}

// Separa por comas de primer nivel (no las de :where(a, b) ni [x="a,b"]).
export function separar(lista: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let comilla: string | null = null;
  let actual = "";
  for (const c of lista) {
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === "(" || c === "[") nivel++;
    else if (c === ")" || c === "]") nivel--;
    else if (c === "," && nivel === 0) {
      partes.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

export function aislarSelector(lista: string, hoja: "bidware" | "fr8bid"): string | null {
  // «html, body, #root { height: 100% }» es el armazón de la página de Bidware,
  // no de un contenedor: dentro de Fr8Bid sobra.
  if (hoja === "bidware" && separar(lista).includes("#root")) return null;
  const partes = separar(lista)
    .map((s) => (hoja === "bidware" ? bajoBidware(s) : fueraDeBidware(s)))
    .filter((s): s is string => s !== null);
  return partes.length ? [...new Set(partes)].join(", ") : null;
}

const dentroDeKeyframes = (regla: any) => {
  for (let p = regla.parent; p; p = p.parent) if (p.type === "atrule" && /keyframes$/i.test(p.name)) return true;
  return false;
};

// hojaDe(ruta) dice qué hoja es cada archivo; null = no se toca.
export function aislarEstilos(hojaDe: (archivo: string) => "bidware" | "fr8bid" | null) {
  return {
    postcssPlugin: "fr8bid-aislar-estilos",
    Once(root: any) {
      const hoja = hojaDe(String(root.source?.input?.file || ""));
      if (!hoja) return;
      root.walkRules((regla: any) => {
        if (dentroDeKeyframes(regla)) return;
        const nuevo = aislarSelector(regla.selector, hoja);
        if (nuevo === null) regla.remove();
        else regla.selector = nuevo;
      });
    }
  };
}
