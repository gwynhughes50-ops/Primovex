# MedTrak+ v0.9.17 - Governance Suite Phase 1: Subject Access Requests

## Install

Copy the files from this package into your real Git repository:

`C:\Users\gwynh\OneDrive\Documents\GitHub\New folder\aurora-stock`

Then run:

```bash
npm run dev
```

## Test Checklist

1. App loads without console errors.
2. Desktop navigation shows `SARs`.
3. `/governance/sars` opens.
4. Create a new SAR using EMIS number only.
5. Confirm due date automatically calculates 28 days from received date.
6. Assign to a user.
7. Open the SAR and change status.
8. Tick checklist items.
9. Add a note and confirm the timeline updates.
10. Check the Inbox for assignment notification if notification create rules have been updated.

## Git Commit

```bash
git add .
git commit -m "release(v0.9.17): add governance SAR workflow"
git push
```
