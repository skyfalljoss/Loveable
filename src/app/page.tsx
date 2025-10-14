import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

const Page = async () => {
  const users = await prisma.post.findMany();


  return (
    <div >   
      <h1 className="text-3xl font-bold underline">Page</h1>
      <Button >Click me</Button>
      {JSON.stringify(users, null, 2)}
    </div>
    
  );
};

export default Page;