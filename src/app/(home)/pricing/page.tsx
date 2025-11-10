"use client"

import Image from "next/image"
import { PricingTable } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useCurrentTheme } from "@/hooks/use-current-theme";

const Page = () => {

    const currentTheme = useCurrentTheme();
    return(
        <div className="flex flex-col max-w-3xl mx-auto w-full">
            <section className="space-y-6 pt-[16vh] 2xl:pt-48">
                <div className="flex flex-col items-center">
                    <Image 
                        src ="/logo.svg"
                        alt="vibe"
                        height={50}
                        width={50}
                        className="hidden md:block"
                    />
                    <h1 className="text-xl md:text-3xl font-bold text-center py-5">Pricing</h1>
                    <p className="text-muted-foreground text-center text-sm md:text-base pb-5">Choose your plan that fit your need</p>
                    <PricingTable
                        appearance={{
                            baseTheme: currentTheme ==="dark" ? dark : undefined,
                            elements: {
                                pricingTableCard: "border shadow-none rounded-lg"
                            }
                        }}
                    />
                </div>
            </section>
            
        </div>
    )
};

export default Page