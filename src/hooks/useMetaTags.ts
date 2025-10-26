import { useEffect } from "react";

interface MetaTagsProps {
  title?: string;
  description?: string;
  keywords?: string;
}

/**
 * Hook to manage document meta tags
 */
export function useMetaTags({ title, description, keywords }: MetaTagsProps) {
  useEffect(() => {
    const originalTitle = document.title;

    if (title) {
      document.title = title;
    }

    // Update meta description
    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement("meta");
        metaDescription.setAttribute("name", "description");
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute("content", description);
    }

    // Update meta keywords
    if (keywords) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement("meta");
        metaKeywords.setAttribute("name", "keywords");
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute("content", keywords);
    }

    // Cleanup function to restore original title
    return () => {
      document.title = originalTitle;
    };
  }, [title, description, keywords]);
}
