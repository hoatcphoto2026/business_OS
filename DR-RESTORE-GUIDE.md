# Hướng dẫn DR Restore thật (pg_dump / pg_restore)

**Mục tiêu**: Chứng minh có thể backup và restore PostgreSQL, sau đó Administration Center vẫn đăng nhập và hoạt động được.  
**Thời gian ước lượng**: 30–60 phút.  
**Công cụ**: `pg_dump`, `pg_restore` (có sẵn trong PostgreSQL 18 của bạn).

---

## 0. Chuẩn bị

- PostgreSQL 18 đang chạy trên máy bạn.
- Đã có database `business_os` (đã migrate + seed).
- Biết mật khẩu user `postgres`.
- Terminal (PowerShell hoặc cmd).

Đường dẫn psql (điều chỉnh nếu khác):
```
D:\Program Files\PostgreSQL\18\bin\
```

---

## 1. Tạo backup

Mở PowerShell:

```powershell
cd D:\path\to\business-os-backend

# Tạo thư mục lưu backup
mkdir backups -ErrorAction SilentlyContinue

# Dump database (custom format, nén)
& "D:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  -U postgres `
  -Fc `
  -f backups\business_os_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump `
  business_os
```

Nhập mật khẩu khi được hỏi.  
Kết quả: file `backups\business_os_YYYYMMDD_HHMMSS.dump`.

Ghi lại thời điểm backup (đây là mốc RPO).

---

## 2. Tạo database restore

```powershell
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE business_os_restore;"
```

---

## 3. Restore

```powershell
$dump = Get-ChildItem backups\*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1

& "D:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  -U postgres `
  -d business_os_restore `
  --no-owner `
  --no-acl `
  $dump.FullName
```

Nếu có warning về role/owner thì có thể bỏ qua (đã dùng `--no-owner`).

---

## 4. Trỏ ứng dụng sang DB restore

Tạm thời sửa `.env`:

```env
DB_NAME=business_os_restore
```

(Giữ nguyên host, port, user, password.)

---

## 5. Khởi động và kiểm tra

```powershell
npm run start:dev
```

Trong terminal khác hoặc dùng trình duyệt / Postman / curl:

1. Login:
   ```http
   POST http://localhost:3000/api/v1/auth/login
   Content-Type: application/json

   {
     "email": "admin@abctrading.vn",
     "password": "Password123!",
     "tenant": "ABC"
   }
   ```
2. Gọi admin:
   ```http
   GET http://localhost:3000/api/v1/admin/users
   Authorization: Bearer <token>
   ```
3. Gọi metrics:
   ```http
   GET http://localhost:3000/api/v1/admin/metrics
   Authorization: Bearer <token>
   ```

Kỳ vọng: login thành công, trả về danh sách user, metrics có dữ liệu.

---

## 6. Ghi evidence

Tạo file `artifacts/admin-enterprise-upgrade/08-dr/evidence/DR-RESTORE-YYYYMMDD.md` với nội dung:

```markdown
# DR Restore Evidence

- **Date**: 2026-10-27
- **Backup file**: backups/business_os_....dump
- **Backup time**: HH:MM
- **Restore start**: HH:MM
- **Restore end**: HH:MM
- **RTO**: X phút
- **RPO**: thời điểm backup (logical dump)
- **Verification**:
  - [x] Login admin@abctrading.vn thành công
  - [x] GET /admin/users trả dữ liệu
  - [x] GET /admin/metrics trả dữ liệu
- **Notes**: ...
```

---

## 7. Dọn dẹp (tuỳ chọn)

```powershell
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "DROP DATABASE business_os_restore;"
```

Đổi `.env` về `DB_NAME=business_os`.

---

## Checklist nhanh

- [ ] `pg_dump` tạo được file `.dump`
- [ ] `CREATE DATABASE business_os_restore` thành công
- [ ] `pg_restore` chạy xong (không lỗi nghiêm trọng)
- [ ] App start với `DB_NAME=business_os_restore`
- [ ] Login + 2 API admin thành công
- [ ] Ghi evidence (thời gian + kết quả)
- [ ] (Tuỳ chọn) Drop DB restore và trả `.env` về bình thường

---

## Nâng cao (sau này)

- Chuyển sang **PITR** (base backup + WAL archiving) để RPO ≤ 15 phút.
- Tự động hoá backup hàng ngày bằng Task Scheduler (Windows) hoặc cron.
- Lưu backup ra ngoài máy (S3, NAS, máy khác).

---

**Kết quả mong đợi**: Có 1 lần restore thật được ghi lại, chứng minh RTO/RPO ở mức logical dump và Administration Center hoạt động sau restore.
