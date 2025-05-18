import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.cloudflare.env.VALUE_FROM_CLOUDFLARE };
}

export default function About({ loaderData }: Route.ComponentProps) {
  return (
    <div className="p-4 text-center"> 
      {loaderData.message}
    </div>
  );
}
