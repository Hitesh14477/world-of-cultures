import { Router } from 'express'
import multer from 'multer'
import CommunityPost from '../models/CommunityPost.js'
import Country from '../models/Country.js'
import { createCommunityController, MAX_IMAGE_BYTES } from '../controllers/communityController.js'
import { createUserAuth } from '../middleware/userAuth.js'
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

export function createCommunityRouter({ CommunityPostModel = CommunityPost, CountryModel = Country, UserModel, env = process.env, imageStorage, auth: providedAuth, adminAuth } = {}) {
  const router = Router()
  const auth = providedAuth || createUserAuth({ UserModel, env })
  const controller = createCommunityController({ CommunityPostModel, CountryModel, imageStorage })

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', auth.requireUser, auth.requireCsrf, controller.rateLimitCreation, handleUpload, controller.create)
  router.patch('/:id', auth.requireUser, auth.requireCsrf, handleUpload, controller.update)
  router.delete('/:id', auth.requireUser, auth.requireCsrf, controller.remove)

  if (adminAuth) {
    async function resolveAdminPostOwner(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Community post not found.' })
        const post = await CommunityPostModel.findOne({ _id: req.params.id, status: 'published' }).select('author').lean()
        if (!post) return res.status(404).json({ success: false, message: 'Community post not found.' })
        req.user = { id: String(post.author) }
        return next()
      } catch (error) { return next(error) }
    }

    router.patch('/moderation/:id', adminAuth.requireAdmin, adminAuth.requireCsrf, resolveAdminPostOwner, handleUpload, controller.update)
    router.delete('/moderation/:id', adminAuth.requireAdmin, adminAuth.requireCsrf, resolveAdminPostOwner, controller.remove)
  }

  return router
}
