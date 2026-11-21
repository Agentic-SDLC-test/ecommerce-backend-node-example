'use strict';

const { config } = require('../config/env');

/**
 * OpenAPI 3.0 specification for the ecommerce backend.
 *
 * This is hand-authored (rather than generated from JSDoc) so it can precisely
 * describe the flat, backwards-compatible URL contract consumed by the
 * ecommerce React Native app, including its quirks (GET-based deletes,
 * `x-auth-token` header auth, `categories` vs `data` envelopes, etc.).
 */

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ecommerce Backend API',
    version: '2.0.0',
    description:
      'REST API for the ecommerce platform. Backend for the ecommerce React Native example app.\n\n' +
      '**Auth:** Protected endpoints require a JWT sent in the `x-auth-token` header. Obtain a token from `POST /login`.',
  },
  servers: [{ url: `http://localhost:${config.port}`, description: 'Local server' }],
  tags: [
    { name: 'Auth', description: 'Registration, login and account management' },
    { name: 'Products', description: 'Product catalog' },
    { name: 'Categories', description: 'Product categories' },
    { name: 'Orders', description: 'Checkout and order history' },
    { name: 'Wishlist', description: 'User wishlist' },
    { name: 'Cart', description: 'Server-side cart (optional)' },
    { name: 'Admin', description: 'Admin-only dashboard, users and orders' },
    { name: 'Uploads', description: 'Image uploads' },
    { name: 'System', description: 'Health and diagnostics' },
  ],
  components: {
    securitySchemes: {
      authToken: {
        type: 'apiKey',
        in: 'header',
        name: 'x-auth-token',
        description: 'JWT obtained from POST /login',
      },
    },
    schemas: {
      SuccessMessage: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'operation successful' },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          userType: { type: 'string', enum: ['USER', 'ADMIN'] },
          token: { type: 'string', description: 'JWT (only present after login)' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          image: { type: 'string', nullable: true },
          icon: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
        },
      },
      Product: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          sku: { type: 'string' },
          price: { type: 'number' },
          image: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'number' },
          category: { $ref: '#/components/schemas/Category' },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          categoryId: { type: 'string' },
          quantity: { type: 'number' },
          price: { type: 'number' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          orderId: { type: 'string' },
          user: { type: 'string' },
          items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
          amount: { type: 'number' },
          discount: { type: 'number' },
          shippingAddress: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'shipped', 'delivered'] },
          country: { type: 'string' },
          city: { type: 'string' },
          zipcode: { type: 'string' },
          payment_type: { type: 'string', enum: ['cod', 'online'] },
          payment_status: { type: 'string', enum: ['pending', 'paid', 'failed'] },
          shippedOn: { type: 'string' },
          deliveredOn: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: { 200: { description: 'Service is healthy' } },
      },
    },

    '/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                  userType: { type: 'string', enum: ['USER', 'ADMIN'], default: 'USER' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'User created (or validation message)' } },
      },
    },
    '/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login result; `data` contains the user and a `token`.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/update-user': {
      post: {
        tags: ['Auth'],
        summary: 'Update a user',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        responses: { 200: { description: 'Updated user' } },
      },
    },
    '/user': {
      get: {
        tags: ['Auth'],
        summary: 'Get a user by id',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User document' } },
      },
    },
    '/delete-user': {
      get: {
        tags: ['Auth'],
        summary: 'Delete a user by id',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deletion result' } },
      },
    },
    '/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset a user password',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'newPassword'],
                properties: {
                  password: { type: 'string', format: 'password' },
                  newPassword: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Password reset result' } },
      },
    },

    '/products': {
      get: {
        tags: ['Products'],
        summary: 'List products',
        parameters: [
          { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Case-insensitive title filter' },
        ],
        responses: {
          200: {
            description: 'Products list in `data`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/product': {
      post: {
        tags: ['Products'],
        summary: 'Create a product (admin)',
        security: [{ authToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
        },
        responses: { 200: { description: 'Created product' }, 403: { description: 'Not an admin' } },
      },
    },
    '/update-product': {
      post: {
        tags: ['Products'],
        summary: 'Update a product (admin)',
        security: [{ authToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
        responses: { 200: { description: 'Updated product' } },
      },
    },
    '/delete-product': {
      get: {
        tags: ['Products'],
        summary: 'Delete a product (admin)',
        security: [{ authToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deletion result' } },
      },
    },

    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List categories',
        description: 'Returns categories in the `categories` field (not `data`).',
        responses: {
          200: {
            description: 'Categories list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
                    count: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/category': {
      post: {
        tags: ['Categories'],
        summary: 'Create a category (admin)',
        security: [{ authToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Category' } } },
        },
        responses: { 200: { description: 'Created category' } },
      },
    },
    '/update-category': {
      post: {
        tags: ['Categories'],
        summary: 'Update a category (admin)',
        security: [{ authToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Category' } } } },
        responses: { 200: { description: 'Updated category' } },
      },
    },
    '/delete-category': {
      get: {
        tags: ['Categories'],
        summary: 'Delete a category (admin)',
        security: [{ authToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deletion result' } },
      },
    },

    '/orders': {
      get: {
        tags: ['Orders'],
        summary: "Get the authenticated user's orders",
        security: [{ authToken: [] }],
        responses: {
          200: {
            description: 'Orders list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/checkout': {
      post: {
        tags: ['Orders'],
        summary: 'Create an order',
        security: [{ authToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                  amount: { type: 'number' },
                  discount: { type: 'number' },
                  payment_type: { type: 'string', enum: ['cod', 'online'] },
                  payment_status: { type: 'string', enum: ['pending', 'paid', 'failed'] },
                  country: { type: 'string' },
                  city: { type: 'string' },
                  zipcode: { type: 'string' },
                  shippingAddress: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Order created' } },
      },
    },

    '/add-to-wishlist': {
      post: {
        tags: ['Wishlist'],
        summary: 'Add a product to the wishlist',
        security: [{ authToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { productId: { type: 'string' }, quantity: { type: 'number' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Wishlist updated' } },
      },
    },
    '/wishlist': {
      get: {
        tags: ['Wishlist'],
        summary: 'Get the wishlist',
        description: 'Returns an array of user docs in `data`; the client reads `data[0].wishlist`.',
        security: [{ authToken: [] }],
        responses: { 200: { description: 'Wishlist' } },
      },
    },
    '/remove-from-wishlist': {
      get: {
        tags: ['Wishlist'],
        summary: 'Remove a product from the wishlist',
        security: [{ authToken: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' }, description: 'Product id' }],
        responses: { 200: { description: 'Wishlist updated' } },
      },
    },

    '/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Dashboard counts (admin)',
        security: [{ authToken: [] }],
        responses: { 200: { description: 'Counts of users, orders, products, categories' } },
      },
    },
    '/admin/orders': {
      get: {
        tags: ['Admin'],
        summary: 'List all orders (admin)',
        security: [{ authToken: [] }],
        responses: { 200: { description: 'All orders' } },
      },
    },
    '/admin/order-status': {
      get: {
        tags: ['Admin'],
        summary: 'Update an order status (admin)',
        security: [{ authToken: [] }],
        parameters: [
          { name: 'orderId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'status', in: 'query', required: true, schema: { type: 'string', enum: ['pending', 'shipped', 'delivered'] } },
        ],
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users (admin)',
        security: [{ authToken: [] }],
        responses: { 200: { description: 'All users' } },
      },
    },

    '/photos/upload': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload an image',
        description: 'multipart/form-data with a `photos` file field. Returns `{ image: "<filename>" }`.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { photos: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Uploaded',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { image: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = openapiSpec;
