import { withCors } from "../_shared/cors.ts";
import { handleRequest } from "./handler.ts";

Deno.serve(withCors(handleRequest));


