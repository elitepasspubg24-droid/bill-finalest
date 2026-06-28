import { createStartHandler } from '@tanstack/react-start/client'
import { getRouter } from './router'

const router = getRouter()

const handler = createStartHandler({
  router,
})

handler()
