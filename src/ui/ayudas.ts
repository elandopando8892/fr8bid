// Ayudas (8-nov, Jose: «poco texto»): las explicaciones de los módulos quedan
// ocultas y salen con el botón «?» del menú. La preferencia vive en este
// navegador; si el almacenamiento falla, arranca oculto.
import { useEffect, useState } from "react";

const CLAVE = "fr8bid.ver-ayudas";

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function useAyudas(): [boolean, () => void] {
  const [ver, setVer] = useState(leer);
  useEffect(() => {
    document.documentElement.classList.toggle("ver-ayudas", ver);
    try {
      localStorage.setItem(CLAVE, ver ? "1" : "0");
    } catch {
      /* sin almacenamiento: solo esta visita */
    }
  }, [ver]);
  return [ver, () => setVer((v) => !v)];
}
