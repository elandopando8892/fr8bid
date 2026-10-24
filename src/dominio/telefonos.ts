// Números de WhatsApp de los carriers (pedido de Jose del 24-oct-2026).
// Rateware (normalizeWhatsappPhone) toma cualquier número de 10 dígitos como
// México (+52): los 956 de Laredo, McAllen y Brownsville salen mal. Primero
// reglas fijas por lada; lo que las reglas no resuelven (812 = Monterrey o
// Indiana, 314 = Manzanillo o St. Louis…) lo revisa la IA con el nombre y el
// dominio del carrier (api/telefonos.ts). Nada de esto envía mensajes.

export type Pais = "MX" | "US";
export type Certeza = "regla" | "ia" | "dudoso";

export interface Telefono {
  // Dígitos con código de país, listos para wa.me (null = no se puede usar).
  numero: string | null;
  pais: Pais | null;
  certeza: Certeza;
  motivo: string;
}

export interface PistaCarrier {
  carrier?: string | null;
  dominio?: string | null;
}

// Ladas de 3 dígitos de México (las de 2 dígitos son 33, 55, 56 y 81).
const MX = new Set(
  (
    "222 223 224 225 226 227 228 229 231 232 233 236 237 238 241 243 244 245 246 247 248 249 271 272 273 274 275 276 278 279 " +
    "281 282 283 284 285 287 288 294 296 297 311 312 313 314 315 316 317 319 321 322 323 324 325 326 327 328 329 341 342 343 344 345 346 347 348 349 " +
    "351 352 353 354 355 356 357 358 359 371 372 373 374 375 376 377 378 381 382 383 384 385 386 387 388 389 391 392 393 394 395 " +
    "411 412 413 414 415 417 418 419 421 422 423 424 425 426 427 428 429 431 432 433 434 435 436 437 438 441 442 443 444 445 447 448 449 " +
    "451 452 453 454 455 456 457 458 459 461 462 463 464 465 466 467 468 469 471 472 473 474 475 476 477 478 481 482 483 485 486 487 488 489 " +
    "492 493 494 495 496 498 499 588 591 592 593 594 595 596 597 599 612 613 614 615 616 618 621 622 623 624 625 626 627 628 629 631 632 633 634 635 636 637 638 639 " +
    "641 642 643 644 645 646 647 648 649 651 652 653 656 658 659 661 662 664 665 667 668 669 671 672 673 674 675 676 677 686 687 694 695 696 697 698 " +
    "711 712 713 714 715 716 717 718 719 721 722 723 724 725 726 727 728 729 731 732 733 734 735 736 737 738 739 741 742 743 744 745 746 747 748 749 " +
    "751 753 754 755 756 757 758 759 761 762 763 764 765 766 767 768 769 771 772 773 774 775 776 777 778 779 781 782 783 784 785 786 789 791 797 " +
    "821 823 824 825 826 828 829 831 832 833 834 835 836 841 842 844 845 846 861 862 864 866 867 868 869 871 872 873 877 878 891 892 894 897 899 " +
    "913 914 916 917 918 919 923 932 933 934 936 937 938 951 953 954 958 961 962 963 964 965 966 967 968 969 971 972 981 982 983 984 985 986 987 988 991 992 993 994 995 996 997 998 999"
  ).split(" ")
);

// Ladas de EE. UU. que aparecen con carriers: Texas y la frontera primero.
const US = new Set(
  (
    "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979 " +
    "480 520 602 623 928 505 575 405 918 225 318 337 504 985 209 213 310 323 408 415 510 559 562 619 626 650 661 707 714 760 805 818 831 858 909 916 925 949 951 " +
    "312 331 630 708 773 815 847 305 407 561 786 813 954 404 470 678 770 615 629 901 314 816 317 812 201 551 732 973 212 347 646 718 917 704 919 216 614 937 563 515 402 " +
    "414 262 612 651 763 303 720 801 702 503 206 253 313 248 586 734 248 412 215 267 610 717 502 859 205 251 601 662 479 501 870 316 785 913"
  ).split(" ")
);

const GRATUITOS = new Set(["800", "833", "844", "855", "866", "877", "888"]);

const lada = (d: string) => (["33", "55", "56", "81"].includes(d.slice(0, 2)) ? d.slice(0, 2) : d.slice(0, 3));

// Pista por el nombre: «LLC», «Inc.» → EE. UU.; «S.A. de C.V.», «S. de R.L.» → México.
export function pistaPais(p: PistaCarrier): Pais | null {
  const n = ` ${String(p.carrier || "").toLowerCase()} `;
  if (/\bs\.? ?a\.?( de)? ?c\.? ?v\b|\bs\.? de r\.? ?l\b|\bsapi\b/.test(n) || /\.mx$/.test(String(p.dominio || "").toLowerCase())) return "MX";
  if (/\b(llc|inc|corp|ltd|co)\b\.?/.test(n)) return "US";
  return null;
}

export function clasificarTelefono(valor: string | null | undefined, pista: PistaCarrier = {}): Telefono {
  const crudo = String(valor || "").trim();
  let d = crudo.replace(/\D/g, "");
  if (!d) return { numero: null, pais: null, certeza: "regla", motivo: "sin número" };
  // Con código de país escrito: +52 (con o sin el 1 de celular) o +1.
  if (crudo.startsWith("+") || d.length > 10) {
    if (d.startsWith("521") && d.length === 13) return { numero: d, pais: "MX", certeza: "regla", motivo: "trae +52 1" };
    if (d.startsWith("52") && d.length === 12) return { numero: d, pais: "MX", certeza: "regla", motivo: "trae +52" };
    if (d.startsWith("1") && d.length === 11) return { numero: d, pais: "US", certeza: "regla", motivo: "trae +1" };
    if (d.startsWith("011")) d = d.slice(3);
    else return { numero: null, pais: null, certeza: "dudoso", motivo: `formato raro (${d.length} dígitos)` };
  }
  if (d.length !== 10) return { numero: null, pais: null, certeza: "dudoso", motivo: `tiene ${d.length} dígitos, no 10` };
  const l = lada(d);
  const esMx = l.length === 2 || MX.has(l);
  const esUs = US.has(d.slice(0, 3));
  if (esMx && !esUs) return { numero: `52${d}`, pais: "MX", certeza: "regla", motivo: `lada ${l} de México` };
  if (esUs && !esMx) return { numero: `1${d}`, pais: "US", certeza: "regla", motivo: `lada ${d.slice(0, 3)} de EE. UU.` };
  if (GRATUITOS.has(d.slice(0, 3)) && !esMx) return { numero: null, pais: "US", certeza: "regla", motivo: "número gratuito (800, 888…): no tiene WhatsApp" };
  const p = pistaPais(pista);
  const donde = esMx && esUs ? `la lada ${d.slice(0, 3)} existe en México y en EE. UU.` : `lada ${d.slice(0, 3)} desconocida`;
  // Sin IA, la pista del nombre da la mejor apuesta, pero queda marcado.
  const pais: Pais = p ?? (esMx ? "MX" : "US");
  return { numero: pais === "MX" ? `52${d}` : `1${d}`, pais, certeza: "dudoso", motivo: `${donde}${p ? `; por el nombre parece ${p === "MX" ? "de México" : "de EE. UU."}` : ""}` };
}

// Lo que se manda a la IA: solo los dudosos, y nada más que número y pista.
export interface ConsultaTelefono {
  id: string;
  valor: string;
  carrier: string | null;
  dominio: string | null;
}

export interface RespuestaTelefono {
  id: string;
  pais: Pais | null;
  numero: string | null;
  motivo: string;
}

// La IA no puede inventar dígitos: el número final debe terminar con los 10
// dígitos que hay en Rateware y llevar +52 o +1.
export function aceptarRespuestaIA(valor: string, r: { pais: string | null; numero: string | null; motivo: string }): Telefono {
  const d = String(valor).replace(/\D/g, "").slice(-10);
  const n = String(r.numero || "").replace(/\D/g, "");
  const motivo = String(r.motivo || "").slice(0, 160) || "sin explicación";
  if (r.pais === "MX" && n === `52${d}`) return { numero: n, pais: "MX", certeza: "ia", motivo };
  if (r.pais === "US" && n === `1${d}`) return { numero: n, pais: "US", certeza: "ia", motivo };
  return { numero: null, pais: null, certeza: "dudoso", motivo: `la IA no lo pudo resolver: ${motivo}` };
}
