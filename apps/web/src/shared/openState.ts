/**
 * Si un bloque plegable está abierto: una comodidad de cada navegador (localStorage), no un
 * estado de la aplicación. Sin almacenamiento (ventana privada), vale lo de por defecto y no se
 * recuerda.
 */
export function readOpen(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === 'open') return true;
    if (value === 'closed') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(key, open ? 'open' : 'closed');
  } catch {
    // Sin almacenamiento: no se recuerda y ya está.
  }
}
