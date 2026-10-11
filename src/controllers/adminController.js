// src/controllers/adminController.js
import * as adminService from '../services/adminService.js';
import * as eventService from '../services/eventService.js';
import { parsePeriod } from '../utils/period.js';
import { ok, created } from '../utils/response.js';
import * as menus from '../services/eat/dailyMenuService.js';
import * as counter from '../services/eat/counterService.js';
import { eatAnalytics, itemDetail, publicEat } from '../services/eat/eatAdminService.js';

const handle = (fn, send = ok) => async (req, res, next) => {
  try {
    send(res, await fn(req, res));
  } catch (err) {
    next(err);
  }
};

// ── Student-facing events ────────────────────────────────────────────────────
export const listEvents = handle((req) => eventService.listEvents(req.user.uid));
export const getEvent = handle((req) => eventService.getEvent(req.user.uid, req.params.id));
export const updateMyEvent = handle((req) => eventService.updateMyStatus(req.user.uid, req.params.id, req.body));
export const submitFeedback = handle((req) => eventService.submitFeedback(req.user.uid, req.params.id, req.body));

// ── Administration ───────────────────────────────────────────────────────────
export const me = handle((req) => req.admin);
export const overview = handle((req) => adminService.overview(req.admin, parsePeriod(req.query)));
export const explore = handle((req) => adminService.exploreAnalytics(req.admin, parsePeriod(req.query)));
export const organisation = handle((req) => adminService.organisationDetail(req.admin, req.params.id));
export const participants = handle((req) => adminService.listParticipants(req.admin, req.params.id));
export const attendance = handle((req) => adminService.markAttendance(req.admin, req.params.id, req.body.uids, req.body.attended));
export const connect = handle((req) => adminService.connectAnalytics(parsePeriod(req.query)));
export const listProposals = handle(async (req) => ({ proposals: await adminService.listProposals(req.admin) }));
export const getProposal = handle((req) => adminService.getProposal(req.admin, req.params.id));
export const createProposal = handle((req) => adminService.createProposal(req.admin, req.body), created);
export const updateProposal = handle((req) => adminService.updateProposal(req.admin, req.params.id, req.body));
export const decideProposal = handle((req) => adminService.decideProposal(req.admin, req.params.id, req.body));
export const recordOutcome = handle((req) => adminService.recordOutcome(req.admin, req.params.id, req.body));
export const recommendations = handle((req) => adminService.recommendations(req.admin, parsePeriod(req.query)));
export const reviewRecommendation = handle((req) => adminService.reviewRecommendation(req.admin, req.params.id, req.body));

// ── Eat ──────────────────────────────────────────────────────────────────────
export const validateMenu = handle((req) => menus.validateUpload(req.body));
export const saveMenuDraft = handle((req) => menus.saveDraft(req.admin, req.body), created);
export const listMenus = handle(async (req) => ({ menus: await menus.listMenus(req.query) }));
export const getMenuRecord = handle((req) => menus.getMenuRecord(req.params.canteenId, req.params.date));
export const publishMenu = handle((req) => menus.publish(req.admin, req.params.canteenId, req.params.date));
export const importBilling = handle((req) => counter.importBilling(req.admin, req.body), created);
export const eat = handle(async (req) => publicEat(await eatAnalytics(parsePeriod(req.query))));
export const eatItem = handle((req) =>
  itemDetail(req.params.canteenId, req.params.itemId, parsePeriod(req.query), { portions: req.query.portions, unitCost: req.query.unitCost })
);

export async function report(req, res, next) {
  try {
    const period = parsePeriod(req.query);
    const csv = await adminService.report(req.admin, req.params.kind, period);
    res
      .status(200)
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .set('Content-Disposition', `attachment; filename="walterbyte-${req.params.kind}-${period.label.replace(/ /g, '_')}.csv"`)
      .send(csv);
  } catch (err) {
    next(err);
  }
}
