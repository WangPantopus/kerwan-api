import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { licenseService } from "../services/licenseService.js";

const validateSchema = z.object({
  key: z.string().min(1, "key is required"),
  machineId: z.string().min(1, "machineId is required").max(256),
});

const activateSchema = z.object({
  key: z.string().min(1, "key is required"),
  machineId: z.string().min(1, "machineId is required").max(256),
  email: z.string().email("email must be a valid email address"),
});

const deactivateSchema = z.object({
  key: z.string().min(1, "key is required"),
  machineId: z.string().min(1, "machineId is required").max(256),
});

export async function licenseRoutes(app: FastifyInstance) {
  // POST /api/license/validate
  app.post("/validate", async (request, reply) => {
    const body = validateSchema.parse(request.body);
    const result = await licenseService.validate(body.key, body.machineId);
    return reply.send(result);
  });

  // POST /api/license/activate
  app.post("/activate", async (request, reply) => {
    const body = activateSchema.parse(request.body);
    const result = await licenseService.activate(
      body.key,
      body.machineId,
      body.email,
    );
    return reply.status(201).send(result);
  });

  // POST /api/license/deactivate  (frees a machine slot)
  app.post("/deactivate", async (request, reply) => {
    const body = deactivateSchema.parse(request.body);
    await licenseService.deactivate(body.key, body.machineId);
    return reply.status(204).send();
  });
}
