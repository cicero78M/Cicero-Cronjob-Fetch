# Role-aware user deactivation

This document outlines how Cicero handles per-role removals and user deactivation when operators or services request status changes.

## Helper: `deactivateRoleOrUser(userId, roleName?)`

- Reads the user's active roles from `user_roles`.
- If `roleName` is provided and other roles remain, only that role link is removed while keeping the user active.
- If the removed role is the last one _or_ no role is provided, the helper flips `status` to `false`.
- All changes run inside a transaction so role rows and the `user` table stay consistent with `removeRole` semantics.

## WhatsApp operator menu

- The **Ubah Status User** flow now lists active roles.
- When a user has multiple roles and the operator chooses **Nonaktif**, the menu prompts for the target role to remove before applying `deactivateRoleOrUser`.
- The confirmation message shows which role was changed and which roles remain active.

## Bulk deletion requests (`clientrequest` menu)

- When a user has multiple active roles, the bulk flow now pauses and asks the operator to pick one before applying the change. The menu uses two steps: `bulkStatus_chooseRole` sends the prompt, and `bulkStatus_applySelection` processes the reply.
- Prompt template:  
  `User <NAMA/NRP> memiliki lebih dari satu role aktif. NRP/NIP: <NRP> ... Pilih role yang akan dihapus: 1. <role> ... Balas angka sesuai pilihan atau ketik *batal* untuk membatalkan proses.`
- After a role is chosen, `deactivateRoleOrUser` runs for that role. WhatsApp numbers are cleared only when the resulting user status becomes `false`.
- The final summary lists the chosen role (if any) and whether the user remains aktif or becomes nonaktif per entry.
- After sending the bulk deletion summary (or when the operator cancels), the `clientrequest` session is cleared so subsequent messages are treated as fresh input.

## REST: `DELETE /users/:id`

- Accepts an optional `role` parameter (query string or request body).
- Delegates to `deactivateRoleOrUser`; if a role is supplied, only that role is removed unless it was the last one, in which case the user is deactivated.
- Without `role`, the endpoint deactivates the user directly.

## Testing

Jest coverage now includes multi-role cases:

- Removing a specific role while other roles keep the user active.
- Removing the last role sets `status` to `false`.
