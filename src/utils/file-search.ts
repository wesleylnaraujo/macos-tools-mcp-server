import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { basename } from "path";
import { SearchResult } from "../tools/types.js";

const execAsync = promisify(exec);

export async function searchWithSpotlight(
  query: string,
  path?: string,
  fileTypes?: string[]
): Promise<SearchResult[]> {
  try {
    let mdfindQuery = query;
    const args: string[] = [];
    
    if (path) {
      args.push(`-onlyin "${path}"`);
    }
    
    if (fileTypes && fileTypes.length > 0) {
      const typeQuery = fileTypes
        .map(ext => `kMDItemFSName == "*.${ext}"`)
        .join(" || ");
      mdfindQuery = `(${typeQuery}) && (${query})`;
    }
    
    const { stdout } = await execAsync(
      `mdfind ${args.join(" ")} '${mdfindQuery}'`
    );
    
    const files = stdout.trim().split("\n").filter(Boolean);
    const results: SearchResult[] = [];
    
    for (const file of files) {
      try {
        const stats = await stat(file);
        results.push({
          path: file,
          filename: basename(file),
          size: stats.size,
          modifiedDate: stats.mtime,
          score: 1.0,
        });
      } catch {
        // Skip files we can't access
      }
    }
    
    return results;
  } catch (error) {
    throw new Error(`Spotlight search failed: ${error}`);
  }
}

export async function searchFileContent(
  pattern: string,
  path: string,
  fileTypes?: string[],
  isRegex: boolean = false
): Promise<SearchResult[]> {
  try {
    const includes = fileTypes?.map(ext => `--include="*.${ext}"`).join(" ") || "";
    const regexFlag = isRegex ? "-E" : "-F";
    
    const { stdout } = await execAsync(
      `grep -r ${regexFlag} -n ${includes} "${pattern}" "${path}" 2>/dev/null | head -1000`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const results: SearchResult[] = [];
    const lines = stdout.trim().split("\n").filter(Boolean);
    
    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        const filePath = match[1];
        const lineNumber = parseInt(match[2]);
        const content = match[3];
        
        try {
          const stats = await stat(filePath);
          results.push({
            path: filePath,
            filename: basename(filePath),
            size: stats.size,
            modifiedDate: stats.mtime,
            matchedContent: content.trim().substring(0, 200),
            lineNumber,
            score: 1.0,
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }
    
    return results;
  } catch (error) {
    if ((error as any).code === 1) {
      // No matches found
      return [];
    }
    throw new Error(`Content search failed: ${error}`);
  }
}

export async function getFileTags(filePath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `xattr -p com.apple.metadata:_kMDItemUserTags "${filePath}" 2>/dev/null | xxd -r -p | plutil -convert json -o - -`
    );
    
    const tags = JSON.parse(stdout);
    return tags.map((tag: any) => {
      if (typeof tag === "string") return tag;
      if (tag && typeof tag === "object" && tag.name) return tag.name;
      return null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export async function setFileTags(filePath: string, tags: string[]): Promise<void> {
  try {
    if (tags.length === 0) {
      // Remove tags
      await execAsync(`xattr -d com.apple.metadata:_kMDItemUserTags "${filePath}" 2>/dev/null`);
      return;
    }
    
    // Create plist format for tags
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
${tags.map(tag => `  <string>${tag}</string>`).join("\n")}
</array>
</plist>`;
    
    // Convert to binary plist and set as xattr
    const { stdout } = await execAsync(
      `echo '${plistContent}' | plutil -convert binary1 -o - - | xxd -p | tr -d '\n'`
    );
    
    await execAsync(
      `xattr -wx com.apple.metadata:_kMDItemUserTags "${stdout}" "${filePath}"`
    );
  } catch (error) {
    throw new Error(`Failed to set tags: ${error}`);
  }
}

export async function searchByTags(
  tags: string[],
  path?: string
): Promise<SearchResult[]> {
  try {
    const tagQuery = tags
      .map(tag => `kMDItemUserTags == "${tag}"`)
      .join(" || ");
    
    let command = `mdfind '${tagQuery}'`;
    if (path) {
      command = `mdfind -onlyin "${path}" '${tagQuery}'`;
    }
    
    const { stdout } = await execAsync(command);
    const files = stdout.trim().split("\n").filter(Boolean);
    const results: SearchResult[] = [];
    
    for (const file of files) {
      try {
        const stats = await stat(file);
        const fileTags = await getFileTags(file);
        
        results.push({
          path: file,
          filename: basename(file),
          size: stats.size,
          modifiedDate: stats.mtime,
          tags: fileTags,
          score: tags.filter(t => fileTags.includes(t)).length / tags.length,
        });
      } catch {
        // Skip inaccessible files
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    throw new Error(`Tag search failed: ${error}`);
  }
}

export function fuzzyMatch(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (textLower.includes(queryLower)) {
    return 1.0;
  }
  
  let score = 0;
  let queryIndex = 0;
  let textIndex = 0;
  
  while (queryIndex < queryLower.length && textIndex < textLower.length) {
    if (queryLower[queryIndex] === textLower[textIndex]) {
      score++;
      queryIndex++;
    }
    textIndex++;
  }
  
  return queryIndex === queryLower.length ? score / queryLower.length : 0;
}

export async function searchFilenames(
  query: string,
  path: string,
  fileTypes?: string[],
  maxResults: number = 100
): Promise<SearchResult[]> {
  try {
    const findArgs: string[] = [path];
    
    if (fileTypes && fileTypes.length > 0) {
      const typeArgs = fileTypes
        .map((ext, i) => i === 0 ? `-name "*.${ext}"` : `-o -name "*.${ext}"`)
        .join(" ");
      findArgs.push(`\\( ${typeArgs} \\)`);
    }
    
    const { stdout } = await execAsync(
      `find ${findArgs.join(" ")} -type f 2>/dev/null | head -${maxResults * 2}`
    );
    
    const files = stdout.trim().split("\n").filter(Boolean);
    const results: SearchResult[] = [];
    
    for (const file of files) {
      const filename = basename(file);
      const score = fuzzyMatch(query, filename);
      
      if (score > 0.5) {
        try {
          const stats = await stat(file);
          results.push({
            path: file,
            filename,
            size: stats.size,
            modifiedDate: stats.mtime,
            score,
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  } catch (error) {
    throw new Error(`Filename search failed: ${error}`);
  }
}