import { Router } from 'express'
import { createUserController } from '../controllers/userController.js'
import { createUserAuth } from '../middleware/userAuth.js'
import { createAdminAuth } from '../middleware/adminAuth.js'
import { createMemberAuth } from '../middleware/memberAuth.js'
import User from '../models/User.js'
import UserFavourite from '../models/UserFavourite.js'
import Notification from '../models/Notification.js'
import { createNotificationController } from '../controllers/notificationController.js'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import { communityImageStorage } from '../services/communityImageStorage.js'

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROFILE_IMAGE_BYTES, files: 1, fields: 4, parts: 5 },
})

function handleProfileImageUpload(req, res, next) {
  uploadProfileImage.single('avatar')(req, res, async (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Profile images must be 5 MB or smaller.' })
    if (error) return res.status(400).json({ success: false, message: 'The profile image upload could not be read.' })
    if (req.file) {
      try {
        const detected = await fileTypeFromBuffer(req.file.buffer)
        if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
          return res.status(415).json({ success: false, message: 'Use a valid JPEG, PNG, or WebP profile image.' })
        }
      } catch {
        return res.status(415).json({ success: false, message: 'Use a valid JPEG, PNG, or WebP profile image.' })
      }
    }
    return next()
  })
}

export function createUserRouter({ CountryModel, CulturalEntryModel, PlaceModel, CommunityPostModel, UserModel = User, UserFavouriteModel = UserFavourite, NotificationModel = Notification, env = process.env, auth: providedAuth, adminAuth: providedAdminAuth, memberAuth: providedMemberAuth, imageStorage = communityImageStorage } = {}) {
  const router = Router()
  const auth = providedAuth || createUserAuth({ UserModel, env })
  const adminAuth = providedAdminAuth || createAdminAuth(env)
  const memberAuth = providedMemberAuth || createMemberAuth({ userAuth: auth, adminAuth, UserModel })
  const controller = createUserController({ CountryModel, CulturalEntryModel, PlaceModel, UserFavouriteModel, UserModel, CommunityPostModel, imageStorage })
  const notifications = createNotificationController({ NotificationModel })

  router.post('/register', auth.register)
  router.post('/login', auth.login)
  router.post('/logout', auth.requireUser, auth.requireCsrf, auth.logout)
  router.get('/session', auth.requireUser, auth.currentSession)
  router.get('/public/:username', controller.getPublicProfile)
  router.get('/me/username-availability', memberAuth.requireMember, controller.checkUsernameAvailability)
  router.get('/me/profile', memberAuth.requireMember, controller.getProfile)
  router.patch('/me/profile', memberAuth.requireMember, memberAuth.requireCsrf, handleProfileImageUpload, controller.updateProfile)
  router.get('/me/contributions', memberAuth.requireMember, controller.listMyContributions)
  router.get('/me/community-posts', memberAuth.requireMember, controller.listMyCommunityPosts)
  router.get('/me/favourites', memberAuth.requireMember, controller.listFavourites)
  router.post('/me/favourites', memberAuth.requireMember, memberAuth.requireCsrf, controller.addFavourite)
  router.get('/me/favourites/:type/:id', memberAuth.requireMember, controller.getFavouriteStatus)
  router.delete('/me/favourites/:type/:id', memberAuth.requireMember, memberAuth.requireCsrf, controller.removeFavourite)
  router.get('/me/notifications/unread-count', memberAuth.requireMember, notifications.unreadCount)
  router.get('/me/notifications', memberAuth.requireMember, notifications.list)
  router.patch('/me/notifications/read-all', memberAuth.requireMember, memberAuth.requireCsrf, notifications.markAllRead)
  router.patch('/me/notifications/:id/read', memberAuth.requireMember, memberAuth.requireCsrf, notifications.markRead)
  router.delete('/me/notifications/:id', memberAuth.requireMember, memberAuth.requireCsrf, notifications.remove)

  return router
}
