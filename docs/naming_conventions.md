# Naming Conventions
*Last updated: 2025-06-25*

This document summarizes the naming style used throughout **Cicero_V2**. Follow these guidelines to keep the codebase and database consistent.

## Folders & Files

- Folder names use lowercase letters with no spaces, for example `controller`, `service`, `middleware`.
- File names follow *camelCase* with an extension appropriate to the language (`.js`, `.ts`, etc.), e.g. `userController.js`, `cronRekapLink.js`.
- Avoid special characters other than hyphens (`-`) or underscores (`_`).

## Functions

- Functions use *camelCase*. The first word is lowercase and subsequent words start with a capital letter, e.g. `getAllUsers`, `createClient`.
- Boolean functions are prefixed with `is` or `has`, such as `isAuthorized` or `hasPermission`.
- Async functions should begin with a verb that describes the action, for example `fetchInstagramPosts` or `sendReportViaWA`.

## Database

- Table names use `snake_case` in lowercase, e.g. `insta_post`, `tiktok_comment`.
- Column names also use `snake_case`, for example `client_id`, `created_at`.
- Primary keys use the suffix `_id` to match the entity, such as `user_id` or `client_id`.
- Add indexes on columns that are frequently queried.

These guidelines may be expanded as needed but serve as the basic reference for adding new modules.
