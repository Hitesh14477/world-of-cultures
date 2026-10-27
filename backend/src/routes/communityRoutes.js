import { Router } from 'express'
import multer from 'multer'
import CommunityPost from '../models/CommunityPost.js'
import CommunityLike from '../models/CommunityLike.js'
import CommunityComment from '../models/CommunityComment.js'
import Notification from '../models/Notification.js'
import Country from '../models/Country.js'
import { createCommunityController, MAX_IMAGE_BYTES } from '../controllers/communityController.js'
import { createUserAuth } from '../middleware/userAuth.js'
import { createAdminAuth } from '../middleware/adminAuth.js'
import { createMemberAuth } from '../middleware/memberAuth.js'
import mongoose from 'mongoose'

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2, parts: 3 },
})

function handleUpload(req, res, next) {
  uploadImage.single('image')(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Images must be 5 MB or smaller.' })
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, message: 'Upload one image using the image field.' })
    return res.status(400).json({ success: false, message: 'The image form could not be read.' })
  })
}

export function createCommunityRouter({ CommunityPostModel = CommunityPost, CommunityLikeModel = CommunityLike, CommunityCommentModel = CommunityComment, NotificationModel = Notification, CountryModel = Country, UserModel, env = process.env, imageStorage, auth: providedAuth, adminAuth, memberAuth: providedMemberAuth } = {}) {
  const router = Router()
  const auth = providedAuth || createUserAuth({ UserModel, env })
  const effectiveAdminAuth = adminAuth || createAdminAuth(env)
  const memberAuth = providedMemberAuth || createMemberAuth({ userAuth: auth, adminAuth: effectiveAdminAuth, UserModel })
  const controller = createCommunityController({ CommunityPostModel, CommunityLikeModel, CommunityCommentModel, NotificationModel, CountryModel, UserModel, imageStorage })

  router.get('/', controller.list)
  router.get('/:id/likes/status', memberAuth.requireMember, controller.getLikeStatus)
  router.post('/:id/likes', memberAuth.requireMember, memberAuth.requireCsrf, controller.like)
  router.delete('/:id/likes', memberAuth.requireMember, memberAuth.requireCsrf, controller.unlike)
  router.get('/:id/comments', controller.listComments)
  router.post('/:id/comments', memberAuth.requireMember, memberAuth.requireCsrf, controller.createComment)
  router.delete('/:id/comments/:commentId', memberAuth.requireMember, memberAuth.requireCsrf, controller.removeComment)
  router.get('/:id', controller.getById)
  router.post('/', memberAuth.requireMember, memberAuth.requireCsrf, controller.rateLimitCreation, handleUpload, controller.create)
  router.patch('/:id', memberAuth.requireMember, memberAuth.requireCsrf, handleUpload, controller.update)
  router.delete('/:id', memberAuth.requireMember, memberAuth.requireCsrf, controller.remove)

  if (effectiveAdminAuth) {
    router.delete('/moderation/:id/comments/:commentId', effectiveAdminAuth.requireAdmin, effectiveAdminAuth.requireCsrf, controller.moderateComment)
    async function resolveAdminPostOwner(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Community post not found.' })
        const post = await CommunityPostModel.findOne({ _id: req.params.id, status: 'published' }).select('author').lean()
        if (!post) return res.status(404).json({ success: false, message: 'Community post not found.' })
        req.adminModerationOwnerId = String(post.author)
        req.user = { id: String(post.author) }
        return next()
      } catch (error) { return next(error) }
    }

    router.patch('/moderation/:id', effectiveAdminAuth.requireAdmin, effectiveAdminAuth.requireCsrf, resolveAdminPostOwner, handleUpload, controller.update)
    router.delete('/moderation/:id', effectiveAdminAuth.requireAdmin, effectiveAdminAuth.requireCsrf, resolveAdminPostOwner, controller.remove)
  }

  return router
}
