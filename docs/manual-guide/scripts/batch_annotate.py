"""Batch annotate SIAK screenshots with CLEAN, NON-OVERLAPPING red boxes + arrows.

Design rules:
- Label chip ALWAYS outside the main box (prefer top, then right, then bottom, then left)
- Arrow from the CENTER of the nearest box side pointing TO the label chip
- No overlapping between main box, label chip, and arrow
- Minimum 8px padding from highlighted element
"""
import os, math
from PIL import Image, ImageDraw, ImageFont

RED = (239, 68, 68)
WHITE = (255, 255, 255)
BASE = r"C:\Users\ratih\source\repos\Siak\docs\manual-guide\screenshots"

def get_font(size=22):
    for name in ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

def annotate(path, box, label=None):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    if w < 100 or h < 100:
        print(f"SKIP small: {os.path.basename(path)}")
        return
    x1, y1, x2, y2 = [max(0, min(int(v), w if i % 2 == 0 else h)) for i, v in enumerate(box)]
    if x2 - x1 < 10 or y2 - y1 < 10:
        print(f"SKIP tiny box: {os.path.basename(path)} {box}")
        return
    
    draw = ImageDraw.Draw(img)
    
    # MAIN BOX - precise, 3px thick
    draw.rectangle([x1, y1, x2, y2], outline=RED, width=3)
    
    if not label:
        print(f"OK: {os.path.relpath(path, BASE)} [{x1},{y1},{x2},{y2}]")
        img.save(path)
        return

    f = get_font(20)
    tw = draw.textlength(label, font=f)
    chip_w = tw + 20
    chip_h = 28
    
    # Available space around the main box
    space_top = y1
    space_bottom = h - y2
    space_left = x1
    space_right = w - x2
    
    # Choose label position: prefer side with most space, but avoid corners
    # Priority depends on box position:
    # - If box is near top (y1 < 200): prefer RIGHT > BOTTOM > LEFT > TOP
    # - Otherwise: prefer TOP > RIGHT > BOTTOM > LEFT
    min_margin = 12
    
    # Calculate candidate positions (cx, cy) = top-left of label chip
    candidates = []
    
    near_top = y1 < 200
    if near_top:
        # Near top: avoid TOP position to prevent overlapping headers
        # Priority: RIGHT > BOTTOM > LEFT > TOP
        if space_right >= chip_w + min_margin:
            cx = x2 + min_margin
            cy = max(min_margin, min(y1 + (y2-y1)//2 - chip_h//2, h - chip_h - min_margin))
            candidates.append(("right", cx, cy))
        if space_bottom >= chip_h + min_margin:
            cx = max(min_margin, min(x1 + (x2-x1)//2 - chip_w//2, w - chip_w - min_margin))
            cy = y2 + min_margin
            candidates.append(("bottom", cx, cy))
        if space_left >= chip_w + min_margin:
            cx = x1 - chip_w - min_margin
            cy = max(min_margin, min(y1 + (y2-y1)//2 - chip_h//2, h - chip_h - min_margin))
            candidates.append(("left", cx, cy))
        if space_top >= chip_h + min_margin:
            cx = max(min_margin, min(x1 + (x2-x1)//2 - chip_w//2, w - chip_w - min_margin))
            cy = y1 - chip_h - min_margin
            candidates.append(("top", cx, cy))
    else:
        # Normal: TOP > RIGHT > BOTTOM > LEFT
        if space_top >= chip_h + min_margin:
            cx = max(min_margin, min(x1 + (x2-x1)//2 - chip_w//2, w - chip_w - min_margin))
            cy = y1 - chip_h - min_margin
            candidates.append(("top", cx, cy))
        if space_right >= chip_w + min_margin:
            cx = x2 + min_margin
            cy = max(min_margin, min(y1 + (y2-y1)//2 - chip_h//2, h - chip_h - min_margin))
            candidates.append(("right", cx, cy))
        if space_bottom >= chip_h + min_margin:
            cx = max(min_margin, min(x1 + (x2-x1)//2 - chip_w//2, w - chip_w - min_margin))
            cy = y2 + min_margin
            candidates.append(("bottom", cx, cy))
        if space_left >= chip_w + min_margin:
            cx = x1 - chip_w - min_margin
            cy = max(min_margin, min(y1 + (y2-y1)//2 - chip_h//2, h - chip_h - min_margin))
            candidates.append(("left", cx, cy))
    
    # Fallback: force any available
    if not candidates:
        cx = max(min_margin, min(x1 + (x2-x1)//2 - chip_w//2, w - chip_w - min_margin))
        cy = max(min_margin, y1 - chip_h - min_margin)
        candidates.append(("top", cx, cy))
    
    # Pick first valid candidate (priority order already set)
    pos, label_x, label_y = candidates[0]
    
    # LABEL CHIP
    draw.rounded_rectangle([label_x, label_y, label_x + chip_w, label_y + chip_h], 
                           radius=6, fill=RED)
    draw.text((label_x + 10, label_y + 3), label, font=f, fill=WHITE)
    
    # ARROW: from CENTER of the box side facing the label, TO center of label chip
    box_cx = (x1 + x2) // 2
    box_cy = (y1 + y2) // 2
    label_cx = label_x + chip_w // 2
    label_cy = label_y + chip_h // 2
    
    if pos == "top":
        # Arrow from top-middle of box UP to bottom-middle of label
        sx, sy = box_cx, y1
        tx, ty = label_cx, label_y + chip_h
    elif pos == "bottom":
        # Arrow from bottom-middle of box DOWN to top-middle of label
        sx, sy = box_cx, y2
        tx, ty = label_cx, label_y
    elif pos == "right":
        # Arrow from right-middle of box RIGHT to left-middle of label
        sx, sy = x2, box_cy
        tx, ty = label_x, label_cy
    else:  # left
        # Arrow from left-middle of box LEFT to right-middle of label
        sx, sy = x1, box_cy
        tx, ty = label_x + chip_w, label_cy
    
    # Draw arrow line (3px)
    draw.line([sx, sy, tx, ty], fill=RED, width=4)
    
    # Arrowhead at target (pointing INTO the label chip)
    ang = math.atan2(ty - sy, tx - sx)
    ah = 14
    p1 = (tx - ah * math.cos(ang - 0.42), ty - ah * math.sin(ang - 0.42))
    p2 = (tx - ah * math.cos(ang + 0.42), ty - ah * math.sin(ang + 0.42))
    draw.polygon([(tx, ty), p1, p2], fill=RED)
    
    img.save(path)
    print(f"OK: {os.path.relpath(path, BASE)} [{x1},{y1},{x2},{y2}] pos={pos} label=({label_x},{label_y})")

# Annotations with boxes TIGHT around the specific feature (not whole content)
# Coordinates for 1262x568 viewport
ANNOTS = [
    # === GENERAL ===
    ("general", "01-login-page.png", [420, 190, 850, 470], "Form Login: NIM/NIK/Email + Password + Tombol Masuk"),
    
    # === MAHASISWA ===
    ("mahasiswa", "01-dashboard.png", [290, 140, 950, 330], "Kartu Periode KRS & Info Penting"),
    ("mahasiswa", "02-profil.png", [290, 130, 600, 400], "Kartu Profil & Data Diri"),
    ("mahasiswa", "03-khs.png", [272, 173, 641, 302], "Kartu Hasil Studi (KHS)"),
    ("mahasiswa", "04-riwayat.png", [290, 150, 600, 400], "Ringkasan IPK Kumulatif"),
    ("mahasiswa", "05-krs.png", [290, 150, 600, 450], "Daftar MK Tersedia"),
    ("mahasiswa", "06-kurikulum.png", [290, 140, 980, 470], "Kurikulum per Semester"),
    ("mahasiswa", "07-absensi.png", [290, 150, 980, 450], "Form Check-in Kehadiran"),
    ("mahasiswa", "08-jadwal.png", [290, 140, 980, 470], "Jadwal Kuliah Mingguan"),
    ("mahasiswa", "09-tagihan.png", [290, 140, 980, 470], "Daftar Tagihan Semester"),
    ("mahasiswa", "10-pembayaran.png", [290, 140, 980, 470], "Riwayat Pembayaran"),
    ("mahasiswa", "11-skripsi.png", [290, 140, 600, 400], "Form Pengajuan Skripsi"),
    ("mahasiswa", "12-sidang.png", [290, 140, 980, 470], "Informasi Sidang Skripsi"),
    
    # === DOSEN ===
    ("dosen", "01-dashboard.png", [290, 140, 600, 400], "Ringkasan Mengajar & Bimbingan"),
    ("dosen", "02-pilih-mk.png", [290, 150, 600, 400], "Daftar MK & Tombol Klaim"),
    ("dosen", "03-jadwal.png", [290, 140, 980, 470], "Rencana Mengajar & Kalender"),
    ("dosen", "04-substitute.png", [290, 140, 980, 470], "Daftar Pengajuan Substitute"),
    ("dosen", "05-absensi.png", [290, 140, 600, 400], "Daftar Sesi Absensi"),
    ("dosen", "05b-absensi-buat-sesi.png", [300, 90, 960, 400], "Modal Buat Sesi Absensi"),
    ("dosen", "06-absensi-rekap.png", [290, 140, 980, 470], "Rekap Kehadiran Mahasiswa"),
    ("dosen", "07-bimbingan-proposal.png", [290, 140, 600, 400], "Daftar Proposal Bimbingan"),
    ("dosen", "08-bimbingan-binaan.png", [290, 140, 600, 400], "Daftar Mahasiswa Binaan"),
    ("dosen", "09-nilai.png", [290, 140, 600, 400], "Pilih MK & Daftar Nilai"),
    ("dosen", "09b-nilai-form.png", [290, 140, 980, 470], "Form Nilai per Kelas"),
    ("dosen", "10-slip-gaji.png", [290, 140, 600, 400], "Daftar Slip Gaji per Periode"),
    ("dosen", "11-profile.png", [290, 130, 600, 400], "Profil Dosen & Foto"),
    
    # === ADMIN AKADEMIK ===
    ("admin-akademik", "01-dashboard.png", [290, 140, 600, 400], "Dashboard: Ringkasan Akademik"),
    ("admin-akademik", "02-jadwal.png", [290, 140, 980, 470], "Jadwal Pengajar per Kelas"),
    ("admin-akademik", "03-persetujuan-mk.png", [290, 140, 600, 400], "Antrian Persetujuan MK"),
    ("admin-akademik", "04-proposal.png", [290, 140, 600, 400], "Daftar Proposal Skripsi"),
    ("admin-akademik", "05-master-akademik.png", [290, 140, 980, 470], "Master Akademik (Tabs)"),
    
    # === ADMIN KEUANGAN ===
    ("admin-keuangan", "01-dashboard.png", [290, 140, 600, 400], "Dashboard: Ringkasan Keuangan"),
    ("admin-keuangan", "02-tagihan.png", [290, 140, 600, 400], "Daftar Tagihan per NIM"),
    ("admin-keuangan", "03-payroll.png", [290, 140, 600, 400], "Daftar Gaji Dosen"),
    
    # === ADMIN SISTEM ===
    ("admin-sistem", "01-dashboard.png", [290, 140, 600, 400], "Dashboard: Ringkasan Sistem"),
    ("admin-sistem", "02-users.png", [290, 140, 600, 400], "Tabel Pengguna (RBAC)"),
    ("admin-sistem", "03-master.png", [290, 140, 600, 400], "Master Data Fakultas/Prodi"),
    ("admin-sistem", "04-informasi.png", [290, 140, 600, 400], "Daftar Informasi Penting"),
]

count = 0
missing = []
for subdir, fname, box, label in ANNOTS:
    fpath = os.path.join(BASE, subdir, fname)
    if os.path.exists(fpath):
        try:
            annotate(fpath, box, label)
            count += 1
        except Exception as e:
            print(f"ERR: {fname}: {e}")
    else:
        missing.append(fpath)

if missing:
    print(f"\nMISSING ({len(missing)}):")
    for m in missing:
        print(f"  {m}")
print(f"\nProcessed {count}/{len(ANNOTS)} annotations")