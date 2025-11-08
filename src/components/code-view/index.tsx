import prism from "prismjs";

import {useEffect} from "react";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-typescript";

import "./code-theme.css";

interface Props{
    code: string;
    language: string;
}

export const CodeView = ({
    code,
    language
}: Props) => {

    useEffect(() => {
        prism.highlightAll();
    }, [code, language]);

    return (
        <pre className="p-2 bg-transparent rounded-none border-none m-0 text-xs language-${language}">
            <code className={`language-${language} `}>
                {code}
                
            </code>
        </pre>
    )
}