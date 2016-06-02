/// <reference path="..\..\..\src\harness\harness.ts" />

namespace ts {
    function notImplemented(): any {
        throw new Error("Not yet implemented");
    }

    const nullLogger: server.Logger = {
        close: () => void 0,
        isVerbose: () => void 0, 
        loggingEnabled: () => false,
        perftrc: () => void 0,
        info: () => void 0,
        startGroup: () => void 0,
        endGroup: () => void 0,
        msg: () => void 0
    };

    const { content: libFileContent } = Harness.getDefaultLibraryFile(Harness.IO);

    interface FileOrFolder {
        path: string;
        content?: string;
    }

    interface FSEntry {
        path: Path;
        fullPath: string;
    }

    interface File extends FSEntry {
        content: string;
    }

    interface Folder extends FSEntry {
        entries: FSEntry[];
    }

    function isFolder(s: FSEntry): s is Folder {
        return isArray((<Folder>s).entries);
    }

    function isFile(s: FSEntry): s is File {
        return typeof (<File>s).content === "string";
    }

    function addFolder(fullPath: string, toPath: (s: string) => Path, fs: FileMap<FSEntry>): Folder {
        const path = toPath(fullPath);
        if (fs.contains(path)) {
            Debug.assert(isFolder(fs.get(path)));
            return (<Folder>fs.get(path));
        }

        const entry: Folder = { path, entries: [], fullPath };
        fs.set(path, entry);

        const baseFullPath = getDirectoryPath(fullPath);
        if (fullPath !== baseFullPath) {
            addFolder(baseFullPath, toPath, fs).entries.push(entry);
        }

        return entry;
    }


    function readDirectory(folder: FSEntry, ext: string, excludes: Path[], result: string[]): void {
        if (!folder || !isFolder(folder) || excludes.indexOf(folder.path) >= 0) {
            return;
        }
        for (const entry of folder.entries) {
            if (excludes.indexOf(entry.path) >= 0) {
                continue;
            }
            if (isFolder(entry)) {
                readDirectory(folder, ext, excludes, result);
            }
            else if (fileExtensionIs(entry.path, ext)) {
                result.push(entry.fullPath);
            }
        }
    }

    class TestServerHost implements server.ServerHost {
        args:string[] = [];
        newLine: "\n";

        private fs: ts.FileMap<FSEntry>;
        private toPath: (f: string) => Path;

        constructor(public useCaseSensitiveFileNames: boolean, private executingFilePath: string, private currentDirectory: string, ...fileOrFolderList: FileOrFolder[]) {
            const getCanonicalName = createGetCanonicalFileName(useCaseSensitiveFileNames);
            this.toPath = s => ts.toPath(s, currentDirectory, getCanonicalName);

            this.fs = createFileMap<FSEntry>();
            for (const fileOrFolder of fileOrFolderList) {
                const path = this.toPath(fileOrFolder.path);
                const fullPath = getNormalizedAbsolutePath(fileOrFolder.path, currentDirectory);
                if (typeof fileOrFolder.content === "string") {
                    const entry = { path, content: fileOrFolder.content, fullPath };
                    this.fs.set(path, entry);
                    addFolder(getDirectoryPath(fullPath), this.toPath, this.fs).entries.push(entry);
                }
                else {
                    addFolder(fullPath, this.toPath, this.fs);
                }
            }
        }
        fileExists(s: string) {
            const path = this.toPath(s);
            return this.fs.contains(path) && isFile(this.fs.get(path));
        };

        directoryExists(s: string)  {
            const path = this.toPath(s);
            return this.fs.contains(path) && isFolder(this.fs.get(path));
        }

        getDirectories(s: string) {
            const path = this.toPath(s);
            if (!this.fs.contains(path)) {
                return [];
            }
            else {
                const entry = this.fs.get(path);
                return isFolder(entry) ? map(entry.entries, x => getBaseFileName(x.fullPath)) : []
            }
        }

        readDirectory(path: string, ext: string, excludes: string[]): string[] {
            const result: string[] = [];
            readDirectory(this.fs.get(this.toPath(path)), ext, map(excludes, this.toPath), result);
            return result;
        } 

        readonly setTimeout = (callback: (...args: any[]) => void, ms: number, ...args: any[]): any => void 0;
        readonly clearTimeout = (timeoutId: any): void => void 0;
        readonly readFile = (s: string) => (<File>this.fs.get(this.toPath(s))).content;
        readonly resolvePath = (s: string) => s;
        readonly getExecutingFilePath = () => this.executingFilePath;
        readonly getCurrentDirectory = () => this.currentDirectory;
        readonly writeFile = (path: string, content: string) => notImplemented();
        readonly write = (s: string) => notImplemented();
        readonly createDirectory = (s: string) => notImplemented();
        readonly exit = () => notImplemented();
        readonly watchDirectory = (path: string, callback: DirectoryWatcherCallback, recursive: boolean): FileWatcher => void 0;
        readonly watchFile = (path: string, callback: FileWatcherCallback): FileWatcher => void 0;
    }
    describe("tsserver project system", () => {
        it("create inferred project", () => {
            const appFile: FileOrFolder = {
                path: "/a/b/c/app.ts",
                content: `
                import {f} from "./module"
                console.log(f)
                `
            };
            const libFile: FileOrFolder = {
                path:  "/a/lib/lib.d.ts",
                content: libFileContent
            };
            const moduleFile: FileOrFolder = {
                path: "/a/b/c/module.d.ts",
                content: `export let x: number`
            };
            const host = new TestServerHost(/*useCaseSensitiveFileNames*/ false, getDirectoryPath(libFile.path), "/", appFile, moduleFile, libFile);
            const projectService = new server.ProjectService(host, nullLogger);
            const { configFileName, configFileErrors } = projectService.openClientFile(appFile.path);

            assert(!configFileName, "should not find config, got " + configFileName);
            assert.equal(projectService.inferredProjects.length, 1, "expected one inferred project");
        })
    })
}