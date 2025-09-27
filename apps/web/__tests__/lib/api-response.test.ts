import { successResponse, errorResponse, validateMethod } from '@/lib/api-response'

describe('api-response utilities', () => {
  describe('successResponse', () => {
    it('should return success response with default status 200', async () => {
      const data = { message: 'Success' }
      const response = successResponse(data)
      
      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toEqual(data)
    })

    it('should return success response with custom status', async () => {
      const data = { message: 'Created' }
      const response = successResponse(data, 201)
      
      expect(response.status).toBe(201)
      const json = await response.json()
      expect(json).toEqual(data)
    })
  })

  describe('errorResponse', () => {
    it('should return error response with default status 400', async () => {
      const message = 'Bad request'
      const response = errorResponse(message)
      
      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json).toEqual({ error: message })
    })

    it('should return error response with custom status', async () => {
      const message = 'Not found'
      const response = errorResponse(message, 404)
      
      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json).toEqual({ error: message })
    })
  })

  describe('validateMethod', () => {
    it('should return true for allowed methods', () => {
      const request = new Request('http://localhost', { method: 'GET' })
      expect(validateMethod(request, ['GET', 'POST'])).toBe(true)
    })

    it('should return false for disallowed methods', () => {
      const request = new Request('http://localhost', { method: 'DELETE' })
      expect(validateMethod(request, ['GET', 'POST'])).toBe(false)
    })
  })
})