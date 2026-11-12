# Canonical UI ownership

Source of business rules: `../docs/superpowers/specs/2026-10-16-sage-design.md` and versioned migrations. No payment gateway; interest is an internal support request. No automatic deletion. Admin roles and grants are enforced by SQL, not interface visibility.

| Capability     | Canonical owner             | Source of truth | Allowed variants    | Verification            |
| -------------- | --------------------------- | --------------- | ------------------- | ----------------------- |
| Select/Listbox | Native select               | DESIGN.md       | native              | browser keyboard        |
| Form           | src/components/ui/Field.tsx | DESIGN.md       | create/edit         | tests/browser           |
| Scrollbar      | src/styles/app.css          | DESIGN.md       | global              | browser computed styles |
| Toast          | src/components/ui/State.tsx | DESIGN.md       | inline status/error | browser live region     |
| CRUD           | src/features/devices/api.ts | migrations      | save/return to list | SQL/browser             |

Search/pagination state in private views is transient in component memory to avoid putting sensitive personal selection into URLs. No bulk selection. No date picker; display-only timestamps localized with Intl. Unsaved support drafts remain in memory while retrying; leaving with a draft uses an app-owned confirmation.
