# Third-Party Licenses for SIAK

SIAK (Sistem Informasi Akademik) includes the following third-party software in its production builds. This file fulfills the attribution requirements of their respective licenses.

## Production Dependencies License Summary

| License | Count | Category |
|---------|-------|----------|
| MIT | 245 | Permissive |
| ISC | 33 | Permissive |
| Apache-2.0 | 9 | Permissive |
| BSD-3-Clause | 5 | Permissive |
| BlueOak-1.0.0 | 4 | Permissive |
| BSD-2-Clause | 2 | Permissive |
| MIT-0 | 1 | Permissive |
| 0BSD | 1 | Permissive |
| (MIT AND Zlib) | 1 | Permissive |
| (MIT OR GPL-3.0-or-later) | 1 | Dual (MIT chosen) |
| Undeclared (effectively MIT) | 1 | Reviewed |

## Dual-License Declarations

### jszip@3.10.1
- **License**: (MIT OR GPL-3.0-or-later)
- **Used by**: exceljs@4.4.0 (Excel export functionality)
- **SIAK's Choice**: **MIT License**
- **Justification**: The copyright holder of jszip offers a choice between MIT and GPL-3.0-or-later. SIAK exercises its right to use jszip under the MIT License terms, which permits commercial use, modification, and distribution without copyleft obligations.

## Undeclared License Review

### buffers@0.1.1
- **License field in package.json**: Not present
- **Upstream repository**: `https://github.com/substack/node-buffers` (currently returns 404)
- **Effective license**: **MIT License** — confirmed via Debian package metadata (sources.debian.org) and multiple third-party audits
- **Used by**: Transitive dependency (via `tar` → `@mapbox/node-pre-gyp` or `minipass`)
- **Risk**: No formal license declaration in package.json; upstream repository deleted. Some enterprise compliance tools may flag this.
- **Mitigation**: Documented here as MIT based on Debian verification. For strict compliance environments, consider adding a `package.json` override to `node-buffers` (MIT-licensed fork by dashevo) at the root workspace level, or replacing the dependency chain. The override was tested but requires monorepo configuration adjustments; the documented status is sufficient for most commercial transactions.

## Full Dependency List

See `THIRD-PARTY-LICENSES-FULL.md` for complete per-package listing with repository URLs.

---

## SIAK's Own License

SIAK source code is licensed under the **Apache License 2.0** — see root `LICENSE` file.

Copyright (c) 2024-2025 Ratih Fitriani

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.