import cors from "@fastify/cors";
import type { inferAsyncReturnType } from "@trpc/server";
import * as trpc from "@trpc/server";
import {} from "@trpc/server";
import {
  CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import * as dynamoose from "dynamoose";
import type { Item } from "dynamoose/dist/Item";
import type { Scan } from "dynamoose/dist/ItemRetriever";
import fastify from "fastify";
import { z } from "zod";

function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers["username"] ?? "anonymous" };
  return { req, res, user };
}
type Context = inferAsyncReturnType<typeof createContext>;

const ddb = new dynamoose.aws.ddb.DynamoDB({
  region: "None",
  endpoint: "http://localhost:8000/",
  credentials: {
    accessKeyId: "None",
    secretAccessKey: "None",
  },
});

dynamoose.aws.ddb.set(ddb);

interface PairProps {
  id: string;
  email: string;
  phrase: string;
  translation: string;
}

interface PairItem extends PairProps, Item {}

const PairModel = dynamoose.model<PairItem>("Pairs", {
  id: String,
  email: String,
  phrase: String,
  translation: String,
});

/**
 * @see https://stackoverflow.com/a/62094512
 */
const Pair = {
  of: (props: PairProps) => new PairModel(props),
  scan: (key: keyof PairProps): Scan<PairItem> => PairModel.scan(key),
};

const appRouter = trpc
  .router<Context>()
  .query("usersPairs", {
    // resolve: async () => {
    //   try {
    //     const response = await pify(
    //       Pair.scan("email").contains("sotnikovkirills@gmail.com").exec
    //     )();

    //     console.log(response);

    //     return {
    //       text: "Hello form Backend",
    //       response,
    //     };
    //   } catch (error) {
    //     console.error(error);
    //   }
    //   return { myError: true };
    // },
    input: z
      .object({
        email: z.string(),
      })
      .nullish(),

    resolve: ({ input }) =>
      new Promise((resolve, reject) => {
        // let response: object;
        Pair.scan("email")
          .contains(input?.email)
          .exec((error, result) => {
            if (error) {
              console.error(error);

              reject(error);
            } else {
              console.log(result);
              // response = result.toJSON();

              resolve({
                text: "Hello form Backend",
                result,
              });

              // console.log(response);
            }
          });
      }),
  })
  // .query("usersPairs", {
  //   input: z
  //     .object({
  //       email: z.string(),
  //     })
  //     .nullish(),
  //   resolve: async ({ input }) => {
  //     const res = await Pair.scan("email")
  //       .contains(input.email)
  //       .exec((error, result) => {
  //         if (error) {
  //           console.error(error);

  //           return error;
  //         } else {
  //           console.log(result, input.email);

  //           return result;
  //         }
  //       });
  //     return { total: res };
  //   },
  // })
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
        // id: `${Math.random()}`,
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
  methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
});

server.register(
  (instance, options, done) => {
    fastifyTRPCPlugin(instance, options, done);

    instance.get("/", schema, async function () {
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

export {};
