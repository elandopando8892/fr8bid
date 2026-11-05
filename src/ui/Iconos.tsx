// Iconos del marco con el mismo trazo que usa Fr8Growth (Phosphor: línea
// redondeada de 1.6, currentColor), dibujados aquí para no sumar dependencias.
import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };
const linea = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icono({ size = 18, children, ...rest }: Props & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" {...rest}>
      <g {...linea}>{children}</g>
    </svg>
  );
}

export const Casa = (p: Props) => <Icono {...p}><path d="M3.5 10.5 12 3.5l8.5 7V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5z" /></Icono>;
export const Martillo = (p: Props) => (
  <Icono {...p}>
    <path d="m13.5 4.5 6 6M11 7l6 6M15.5 2.5l6 6-3 3-6-6zM12.5 8.5 4 17a2.1 2.1 0 0 0 3 3l8.5-8.5" />
  </Icono>
);
export const Calculadora = (p: Props) => (
  <Icono {...p}>
    <rect x={5} y={2.5} width={14} height={19} rx={1.5} />
    <path d="M8 6.5h8v3H8zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" />
  </Icono>
);
export const Bandeja = (p: Props) => (
  <Icono {...p}>
    <path d="M3.5 13.5 6 4.5h12l2.5 9V19a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5z" />
    <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
  </Icono>
);
export const Camion = (p: Props) => (
  <Icono {...p}>
    <path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3 3.5v3.5h-7" />
    <circle cx={6.5} cy={17.5} r={1.8} />
    <circle cx={17} cy={17.5} r={1.8} />
  </Icono>
);
export const Lista = (p: Props) => <Icono {...p}><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></Icono>;
export const Mira = (p: Props) => (
  <Icono {...p}>
    <circle cx={12} cy={12} r={8} />
    <circle cx={12} cy={12} r={3} />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  </Icono>
);
export const Sobre = (p: Props) => (
  <Icono {...p}>
    <rect x={3} y={5.5} width={18} height={13} rx={1.5} />
    <path d="m3.5 6.5 8.5 7 8.5-7" />
  </Icono>
);
export const Edificio = (p: Props) => (
  <Icono {...p}>
    <path d="M3.5 20.5h17M5.5 20.5v-16h9v16M14.5 9.5h4v11M8.5 8h3M8.5 11.5h3M8.5 15h3" />
  </Icono>
);
export const Etiqueta = (p: Props) => (
  <Icono {...p}>
    <path d="M3.5 4.5v7.3l8.7 8.7a1 1 0 0 0 1.4 0l6.4-6.4a1 1 0 0 0 0-1.4L11.3 4H4a.5.5 0 0 0-.5.5z" />
    <path d="M8 8.5h.01" />
  </Icono>
);
export const Libro = (p: Props) => (
  <Icono {...p}>
    <path d="M4.5 18.5V5a1.5 1.5 0 0 1 1.5-1.5h13.5v14H6a1.5 1.5 0 0 0-1.5 1.5zM4.5 18.5A1.5 1.5 0 0 0 6 20.5h13.5" />
  </Icono>
);
export const Carpeta = (p: Props) => <Icono {...p}><path d="M3 6.5v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-8L10 5.5H4a1 1 0 0 0-1 1z" /></Icono>;
export const Grafica = (p: Props) => <Icono {...p}><path d="M3.5 20.5h17M6.5 16.5v-5M11 16.5v-9M15.5 16.5v-6M20 16.5V5" /></Icono>;
export const Enchufe = (p: Props) => (
  <Icono {...p}>
    <path d="M8.5 2.5v5M15.5 2.5v5M6 7.5h12v3a6 6 0 0 1-12 0zM12 16.5v5" />
  </Icono>
);
export const Pantalla = (p: Props) => (
  <Icono {...p}>
    <rect x={2.5} y={4} width={19} height={13} rx={1.5} />
    <path d="M8.5 20.5h7M12 17v3.5" />
  </Icono>
);
export const Puntos = (p: Props) => <Icono {...p}><path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={2.6} /></Icono>;
export const Flecha = (p: Props) => <Icono {...p}><path d="M4.5 12h15M13.5 6l6 6-6 6" /></Icono>;
export const Externo = (p: Props) => <Icono {...p}><path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V6.5A.5.5 0 0 1 5 6h5" /></Icono>;
export const Lupa = (p: Props) => <Icono {...p}><circle cx={10.5} cy={10.5} r={6.5} /><path d="m15.5 15.5 5 5" /></Icono>;
export const Mas = (p: Props) => <Icono {...p}><path d="M12 4.5v15M4.5 12h15" /></Icono>;
export const Salir = (p: Props) => <Icono {...p}><path d="M9.5 20.5H5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h4.5M15.5 7.5 20 12l-4.5 4.5M20 12H9.5" /></Icono>;
export const Lapiz = (p: Props) => <Icono {...p}><path d="M4 20h4.5L19 9.5a1.5 1.5 0 0 0 0-2.1l-2.4-2.4a1.5 1.5 0 0 0-2.1 0L4 15.5zM13 6.5l4.5 4.5" /></Icono>;
export const Chat = (p: Props) => <Icono {...p}><path d="M4 5.5h16v10H9l-4.5 4v-4H4z" /></Icono>;
export const Candado = (p: Props) => <Icono {...p}><rect x={5} y={10.5} width={14} height={10} rx={1.5} /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5" /></Icono>;
export const Enviar = (p: Props) => <Icono {...p}><path d="M20.5 3.5 3.5 10.5l7 3 3 7zM20.5 3.5l-10 10" /></Icono>;
export const Check = (p: Props) => <Icono {...p}><path d="m4.5 12.5 5 5 10-11" /></Icono>;
export const Ojo = (p: Props) => <Icono {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx={12} cy={12} r={3} /></Icono>;
export const Alerta = (p: Props) => <Icono {...p}><path d="M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01" /></Icono>;
export const Megafono = (p: Props) => <Icono {...p}><path d="M3.5 10v4h3l8 4.5v-13l-8 4.5zM6.5 14l1.5 5.5h2.5L9.5 15M18 9a4 4 0 0 1 0 6" /></Icono>;
export const Usuarios = (p: Props) => <Icono {...p}><circle cx={9} cy={8.5} r={3.5} /><path d="M2.5 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.7.7 3 2.4 3.5 4.7" /></Icono>;
export const Recargar = (p: Props) => <Icono {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5" /></Icono>;
export const Reloj = (p: Props) => <Icono {...p}><circle cx={12} cy={12} r={8.5} /><path d="M12 7.5V12l3 2" /></Icono>;
export const Mano = (p: Props) => <Icono {...p}><path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.6-2.2L3 15.3a1.5 1.5 0 0 1 2.3-1.9L8 16.5V8a1.5 1.5 0 0 1 3 0" /></Icono>;
