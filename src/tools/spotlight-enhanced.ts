import { homedir } from "os";
import { resolve } from "path";
import {
  EnhancedSearchParams,
  SearchResult,
  SearchResultResponse,
  TagOperationResult,
} from "./types.js";
import {
  searchWithSpotlight,
  searchFileContent,
  searchByTags,
  searchFilenames,
  getFileTags,
  setFileTags,
} from "../utils/file-search.js";
import { stat } from "fs/promises";
import { glob } from "glob";
import { fileTagsCache, createCacheKey } from "../utils/cache.js";

async function performSearch(
  params: EnhancedSearchParams
): Promise<SearchResultResponse> {
  const startTime = Date.now();
  
  try {
    const searchPath = params.path
      ? resolve(params.path.replace("~", homedir()))
      : homedir();
    
    let results: SearchResult[] = [];
    
    switch (params.searchType) {
      case "content": {
        if (!params.query) {
          return { status: "error", error: "Query required for content search" };
        }
        results = await searchFileContent(
          params.query,
          searchPath,
          params.fileTypes,
          false
        );
        break;
      }
      
      case "regex": {
        if (!params.query) {
          return { status: "error", error: "Query required for regex search" };
        }
        results = await searchFileContent(
          params.query,
          searchPath,
          params.fileTypes,
          true
        );
        break;
      }
      
      case "filename": {
        if (!params.query) {
          return { status: "error", error: "Query required for filename search" };
        }
        results = await searchFilenames(
          params.query,
          searchPath,
          params.fileTypes,
          params.maxResults || 100
        );
        break;
      }
      
      case "tags": {
        if (!params.tags || params.tags.length === 0) {
          return { status: "error", error: "Tags required for tag search" };
        }
        results = await searchByTags(params.tags, searchPath);
        break;
      }
      
      default: {
        // Default to Spotlight search
        if (!params.query) {
          return { status: "error", error: "Query required for search" };
        }
        results = await searchWithSpotlight(
          params.query,
          searchPath,
          params.fileTypes
        );
      }
    }
    
    // Apply max results limit
    if (params.maxResults && results.length > params.maxResults) {
      results = results.slice(0, params.maxResults);
    }
    
    // Add tags to results if not already present
    for (const result of results) {
      if (!result.tags) {
        const tagCacheKey = createCacheKey("tags", { path: result.path });
        result.tags = await fileTagsCache.get(tagCacheKey, async () => {
          return await getFileTags(result.path);
        });
      }
    }
    
    const searchTime = Date.now() - startTime;
    
    return {
      status: "success",
      results,
      totalFound: results.length,
      searchTime,
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function performTagOperation(
  params: EnhancedSearchParams
): Promise<TagOperationResult> {
  try {
    if (!params.path || !params.tags || params.tags.length === 0) {
      return {
        status: "error",
        error: "Path and tags required for tag operations",
      };
    }
    
    const targetPath = resolve(params.path.replace("~", homedir()));
    
    // Check if path is a directory or file
    const stats = await stat(targetPath);
    let filesToTag: string[] = [];
    
    if (stats.isDirectory()) {
      // Tag all files in directory
      const pattern = params.fileTypes
        ? `**/*.{${params.fileTypes.join(",")}}`
        : "**/*";
      
      filesToTag = await glob(pattern, {
        cwd: targetPath,
        absolute: true,
        nodir: true,
        maxDepth: params.action === "tag" ? 3 : undefined, // Limit depth for tagging
      });
    } else {
      filesToTag = [targetPath];
    }
    
    let filesTagged = 0;
    
    for (const file of filesToTag) {
      try {
        if (params.action === "tag") {
          const existingTags = await getFileTags(file);
          const newTags = [...new Set([...existingTags, ...params.tags])];
          await setFileTags(file, newTags);
        } else {
          // untag
          const existingTags = await getFileTags(file);
          const newTags = existingTags.filter(t => !params.tags!.includes(t));
          await setFileTags(file, newTags);
        }
        filesTagged++;
      } catch {
        // Skip files we can't tag
      }
    }
    
    return {
      status: "success",
      filesTagged,
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function spotlightEnhanced(
  params: EnhancedSearchParams
): Promise<SearchResultResponse | TagOperationResult> {
  switch (params.action) {
    case "search":
      return performSearch(params);
    
    case "tag":
    case "untag":
      return performTagOperation(params);
    
    default:
      return {
        status: "error",
        error: "Invalid action",
      };
  }
}