# Remaining Proposal Features Implementation Plan

## Implementation approach

The implementation extends the existing Next.js App Router and Prisma patterns. New API routes use the shared Prisma client, role guards, and audit events. Database changes are additive and are paired with a later migration. Export files are generated in memory. The examination client receives isolated issue reporting, connection status, synchronization status, word-count guidance, pause and resume telemetry, and accessible labels without changing response persistence or submission authority.

## Project structure

The `app/api` directory contains protected export, issue, health, reporting, and session routes. The Prisma schema stores issue reports, session integrity fields, and time events. `components/exam` contains the connection hook and status indicator. The exam client integrates these controls in the existing header and response editor. Dashboard reports and monitoring pages expose the new authorized views.

## Design decisions

The existing Bingham University dashboard style is retained. New screens use the existing card, table, button, badge, and muted surface tokens. Controls remain compact and professional. Status meaning is expressed with text and icons, not colour alone. Export controls are visible only for permitted roles. Operational reports are read-only and do not rank candidates or staff.

## Outcomes

Batch exports support password-protected AES-256 ZIP archives and aggregated Excel workbooks, with lecturer course scoping and audit metadata. Issue reports support candidate creation during active attempts and invigilator or administrator acknowledgement. Connection health measures authenticated endpoint latency every fifteen seconds and distinguishes online, degraded, and disconnected states. Synchronization state distinguishes pending, synchronizing, server-confirmed, and failed. Operational reporting adds role-restricted summaries with small-group suppression. Session continuity validates a rotating token and records duplicate-session conflicts. Word counts and lecturer-defined limits are visible and advisory. Pause and resume events are persisted for audit and review without affecting grades. Accessibility requirements are applied to the exam and dashboard workflows, and `ACCESSIBILITY.md` documents checks and limitations.
