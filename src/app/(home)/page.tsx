import { ProjectForm } from "@/modules/home/ui/components/project-form";
import { ProjectList } from "@/modules/home/ui/components/project-list";
import Image from "next/image";


const Page = () => {
 
 
  return (
   <div className="flex flex-col max-w-5xl mx-auto w-full ">
    <section className="space-y-6 py-[16vh] 2xl:py-48">
      <div className="flex flex-col items-center">
        <Image
        src = "/logo.svg"
        alt ="vibe"
        width={50}
        height={50}
        className="hidden md:block"
        />

        <h1 className="text-2xl md:text-5xl font-bold text-center">
          Build something with vibe
        </h1>

        <p className="text-lg md:text-lg text-muted-foreground text-center my-5">
          Create apps and websites with AI
        </p>
        <div className="max-w-3xl mx-auto w-full">
          <ProjectForm/>
        </div>

      </div>
    </section>
    <ProjectList/>
   </div>
   
  );
};

export default Page;