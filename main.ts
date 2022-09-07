import cors from "@fastify/cors";
import * as trpc from "@trpc/server";
import { inferAsyncReturnType } from "@trpc/server";
import {
  CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import * as dynamoose from "dynamoose";
import { Item } from "dynamoose/dist/Item";
import { Scan, ScanResponse } from "dynamoose/dist/ItemRetriever";
import fastify from "fastify";
import { z } from "zod";

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? "anonymous" };
  return { req, res, user };
}
export type Context = inferAsyncReturnType<typeof createContext>;

const ddb = new dynamoose.aws.ddb.DynamoDB({
  region: "None",
  endpoint: "http://localhost:8000/",
  credentials: {
    accessKeyId: "None",
    secretAccessKey: "None",
  },
});

dynamoose.aws.ddb.set(ddb);

export interface PairProps {
  id: string;
  email: string;
  phrase: string;
  translation: string;
}

export interface PairItem extends PairProps, Item {}

const PairModel = dynamoose.model<PairItem>("Pairs", {
  id: String,
  email: String,
  phrase: String,
  translation: String,
});

/**
 * @see https://stackoverflow.com/a/62094512
 */
export const Pair = {
  of: (props: PairProps) => new PairModel(props),
  scan: (key: keyof PairProps): Scan<PairItem> => PairModel.scan(key),
};

export const appRouter = trpc
  .router<Context>()
  .query("hello", {
    resolve: () => {
      return "Hello form Backend";
    },
  })
  .query("usersPairs", {
    input: z
      .object({
        email: z.string(),
      })
      .nullish(),
    resolve: ({ input }) => {
      let response: ScanResponse<PairItem> | boolean | string = false;

      Pair.scan("email")
        .contains(input.email)
        .exec((error, result) => {
          if (error) {
            response = error;
          } else {
            response = result;
          }
        });
      return {
        text: `Get ${input?.email} pairs`,
        pairs: response,
      };
    },
  })
  .mutation("createPair", {
    input: z.object({
      id: z.string(),
      email: z.string(),
      phrase: z.string(),
      translation: z.string(),
    }),
    resolve({ input }) {
      // imagine db call here
      const pair = Pair.of({
        id: input.id,
        email: input.email,
        phrase: input.phrase,
        translation: input.translation,
      });

      pair.save((error) => {
        if (error) {
          console.error(error);
        }
      });

      return {
        id: `${Math.random()}`,
        ...input,
      };
    },
  });

const schema = {
  schema: {
    response: {
      200: {
        type: "object",
        properties: {
          hello: {
            type: "string",
          },
        },
      },
    },
  },
};

const server = fastify({
  maxParamLength: 5000,
});

server.register(cors, {
  origin: "http://localhost:3000",
  credentials: true,
  allowedHeaders: "authorization,content-type", // можно удалть
  methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
});

server.register(
  (instance, options, done) => {
    fastifyTRPCPlugin(instance, options, done);

    instance.get("/", schema, async function (req, reply) {
      return { hello: "world" };
    });
  },
  {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext },
  }
);

(async () => {
  try {
    await server.listen(8002);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
