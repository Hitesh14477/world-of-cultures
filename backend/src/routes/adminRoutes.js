import { Router } from 'express'
import { createAdminController } from '../controllers/adminController.js'
import { createAdminAuth } from '../middleware/adminAuth.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { adminMemberFields, findOrCreateAdminMember } from '../middleware/memberAuth.js'

export function createAdminRouter({ CountryModel, CulturalEntryModel, PlaceModel, UserModel = User, NotificationModel = Notification, env = process.env, auth: providedAuth } = {}) {
  const router = Router()
  const auth = providedAuth || createAdminAuth(env)
  const controller = createAdminController({ CountryModel, CulturalEntryModel, PlaceModel, UserModel, NotificationModel })

  router.post('/login', auth.login)
  router.post('/logout', auth.requireAdmin, auth.requireCsrf, auth.logout)
  router.get('/session', auth.requireAdmin, auth.currentSession)
  router.get('/member-session', auth.requireAdmin, async (req, res, next) => {
    try {
      const member = await findOrCreateAdminMember(UserModel, req.adminSession.username)
      return res.json({ success: true, data: { member: adminMemberFields(member), csrfToken: req.adminSession.csrf } })
    } catch (error) { return next(error) }
  })
  router.get('/overview', auth.requireAdmin, controller.getOverview)
  router.get('/users', auth.requireAdmin, controller.listUsers)
  router.get('/pending', auth.requireAdmin, controller.listPending)
  router.get('/submissions/:type/:id', auth.requireAdmin, controller.getSubmission)
  router.post('/submissions/:type/:id/approve', auth.requireAdmin, auth.requireCsrf, controller.approveSubmission)
  router.post('/submissions/:type/:id/reject', auth.requireAdmin, auth.requireCsrf, controller.rejectSubmission)

  return router
}
