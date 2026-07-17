# MedTrak Mobile

MedTrak Mobile is the phone and tablet experience for MedTrak+.

Its purpose is different from desktop:

- Desktop: manage the practice.
- Tablet: manage a room, stock area or device console.
- Mobile: complete work quickly while moving around the practice.

## Sprint 20A mobile standards

### Naming

The mobile product is branded as **MedTrak Mobile**.

### Session visibility

The mobile header displays how long the current user has been logged in. This gives staff and managers clear session awareness on shared or mobile devices.

### Idle timeout and battery saver

If the user is inactive, MedTrak Mobile displays a warning and then locks the mobile session. When locked, camera scanning is closed to avoid unnecessary battery drain.

### Biometric-ready quick unlock

MedTrak Mobile includes a platform-authenticator quick unlock flow for supported secure browsers and devices. This is designed for Face ID, Touch ID, Windows Hello and Android biometric unlock when the app is installed or used in a secure browser context.

The current implementation is a local device unlock layer that sits on top of the existing Firebase-authenticated session. Future enterprise deployment should add server-side WebAuthn registration and verification before using biometric login as a primary authentication factor.

## Design principle

Mobile screens should not be shrunken desktop screens. They should be task-first, fast and safe to use while walking around a clinical setting.
