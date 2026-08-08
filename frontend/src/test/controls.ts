/**
 * Helper test T3.8 — ambil kontrol form berdasarkan teks terdekat.
 *
 * Komponen halaman Dosen memakai <label> tanpa htmlFor (label + kontrol
 * bersaudara dalam satu div), dan sebagian memakai <h3>/<h4> sebagai
 * penanda section (mis. select "Pilih Kelas" tanpa <label>). Helper ini
 * mencari elemen penanda (label/h3/h4) dengan teks yang cocok lalu
 * mengambil kontrol (select/input/textarea) dari parent div.
 */

export function controlFor(labelText: string, tag: 'select' | 'input' | 'textarea'): HTMLElement {
  const targets = Array.from(document.querySelectorAll('label, h3, h4'));
  const target = targets.find((l) => l.textContent?.trim().startsWith(labelText));
  if (!target) {
    throw new Error(`[controlFor] Penanda tidak ditemukan: "${labelText}"`);
  }
  const container = target.parentElement;
  if (!container) {
    throw new Error(`[controlFor] Penanda tanpa parent element: "${labelText}"`);
  }
  const control = container.querySelector(tag);
  if (!control) {
    throw new Error(`[controlFor] <${tag}> tidak ditemukan untuk "${labelText}"`);
  }
  return control as HTMLElement;
}
