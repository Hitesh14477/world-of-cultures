import { v2 as cloudinary } from 'cloudinary'

function isConfigured(env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

function configurationError() {
  const error = new Error('Community image storage is not configured.')
  error.statusCode = 503
  error.publicMessage = 'Photo sharing is temporarily unavailable because image storage is not configured.'
  return error
}

export function createCommunityImageStorage({ env = process.env, client = cloudinary } = {}) {
  function configure() {
    if (!isConfigured(env)) throw configurationError()
    client.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    })
  }

  return {
    upload(buffer, folder = 'world-of-cultures/community') {
      configure()
      return new Promise((resolve, reject) => {
        const stream = client.uploader.upload_stream({
          folder,
          resource_type: 'image',
          allowed_formats: ['jpg', 'png', 'webp'],
          overwrite: false,
          unique_filename: true,
        }, (error, result) => {
          if (error) return reject(Object.assign(new Error('The image could not be uploaded.'), {
            statusCode: 502,
            publicMessage: 'Your photo could not be uploaded. Please check your connection and try again.',
          }))
          if (!result?.secure_url || !result?.public_id) return reject(Object.assign(new Error('Image storage returned an invalid result.'), {
            statusCode: 502,
            publicMessage: 'Photo sharing is temporarily unavailable. Please try again later.',
          }))
          return resolve({ url: result.secure_url, publicId: result.public_id })
        })
        stream.end(buffer)
      })
    },
    async remove(publicId) {
      configure()
      const result = await client.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
      if (result?.result !== 'ok' && result?.result !== 'not found') {
        throw Object.assign(new Error('The stored image could not be removed.'), { statusCode: 502 })
      }
    },
  }
}

export const communityImageStorage = createCommunityImageStorage()
