// Ambient type augmentation: teach express-session about our session fields so
// `req.session.userId` / `req.session.orgId` are typed across the app.
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    orgId?: number;
    username?: string;
  }
}
