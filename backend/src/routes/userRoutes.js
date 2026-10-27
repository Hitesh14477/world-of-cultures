import { Router } from 'express'
import { createUserController } from '../controllers/userController.js'
import { createUserAuth } from '../middleware/userAuth.js'
import User from '../models/User.js'
import UserFavourite from '../models/UserFavourite.js'

export function createUserRouter({ CountryModel, CulturalEntryModel, PlaceModel, CommunityPostModel, UserModel = User, UserFavouriteModel = UserFavourite, env = process.env, auth: providedAuth } = {}) {
  const router = Router()
  const auth = providedAuth || createUserAuth({ UserModel, env })
  const controller = createUserController({ CountryModel, CulturalEntryModel, PlaceModel, UserFavouriteModel, UserModel, CommunityPostModel })

  router.post('/register', auth.register)
  router.post('/login', auth.login)
  router.post('/logout', auth.requireUser, auth.requireCsrf, auth.logout)
  router.get('/session', auth.requireUser, auth.currentSession)
  router.get('/me/profile', auth.requireUser, controller.getProfile)
  router.patch('/me/profile', auth.requireUser, auth.requireCsrf, controller.updateProfile)
  router.get('/me/contributions', auth.requireUser, controller.listMyContributions)
  router.get('/me/community-posts', auth.requireUser, controller.listMyCommunityPosts)
  router.get('/me/favourites', auth.requireUser, controller.listFavourites)
  router.post('/me/favourites', auth.requireUser, auth.requireCsrf, controller.addFavourite)
  router.get('/me/favourites/:type/:id', auth.requireUser, controller.getFavouriteStatus)
  router.delete('/me/favourites/:type/:id', auth.requireUser, auth.requireCsrf, controller.removeFavourite)

  return router
}
