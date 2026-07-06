// Rótulo aproximado de dispositivo/navegador a partir do User-Agent.
// Não há como obter o modelo exato do aparelho (ex.: "MacBook Pro") a partir
// do UA — apenas sistema operacional e navegador.
export function rotularDispositivo(userAgent: string | null): string | null {
  if (!userAgent) return null;

  let sistema = "Desconhecido";
  if (/iphone/i.test(userAgent)) sistema = "iPhone";
  else if (/ipad/i.test(userAgent)) sistema = "iPad";
  else if (/android/i.test(userAgent)) sistema = "Android";
  else if (/mac os x/i.test(userAgent)) sistema = "Mac";
  else if (/windows/i.test(userAgent)) sistema = "Windows";
  else if (/linux/i.test(userAgent)) sistema = "Linux";

  let navegador = "Navegador";
  if (/edg\//i.test(userAgent)) navegador = "Edge";
  else if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent))
    navegador = "Chrome";
  else if (/crios\//i.test(userAgent)) navegador = "Chrome";
  else if (/firefox\//i.test(userAgent)) navegador = "Firefox";
  else if (/safari\//i.test(userAgent) && /version\//i.test(userAgent))
    navegador = "Safari";

  return `${sistema} · ${navegador}`;
}
