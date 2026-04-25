package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/AlecAivazis/survey/v2/terminal"
)

func getFileByDate() (string, []FileInfo, error) {
	var date string
	valid := false
	for !valid {
		err := survey.AskOne(&survey.Input{
			Message: "Type in the date (formatted in \"YYYY-MM-DD\")",
		}, &date)
		if err != nil {
			if err == terminal.InterruptErr {
				return date, nil, err
			}
		}

		valid = regexp.MustCompile(`\d{4}-\d{2}-\d{2}`).MatchString(date)
		if !valid {
			fmt.Println("Date should be formatted in \"YYYY-MM-DD\"")
		}
	}

	fileInfo, err := listObj(fmt.Sprintf("files/%s", date))
	if err != nil {
		return date, nil, err
	}

	return date, fileInfo, nil
}

func getFile() (string, error) {
	currentDir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	fmt.Println("Select a file")

	for {
		root := filepath.Dir(currentDir)
		entries, err := os.ReadDir(currentDir)
		if err != nil {
			return "", err
		}

		var options []string
		var paths []string

		if currentDir != root {
			options = append(options, "..")
			paths = append(paths, filepath.Dir(currentDir))
		}

		var dirs, files []os.DirEntry
		for _, entry := range entries {
			if entry.IsDir() {
				dirs = append(dirs, entry)
			} else {
				files = append(files, entry)
			}
		}

		for _, dir := range dirs {
			options = append(options, fmt.Sprintf("%s/", dir.Name()))
			paths = append(paths, filepath.Join(currentDir, dir.Name()))
		}

		for _, file := range files {
			options = append(options, file.Name())
			paths = append(paths, filepath.Join(currentDir, file.Name()))
		}

		var selected string
		err = survey.AskOne(&survey.Select{
			Message: fmt.Sprintf("Current directory: %s", currentDir),
			Options: options,
		}, &selected)
		if err != nil {
			return "", err
		}

		for i, opt := range options {
			if opt == selected {
				selectedPath := paths[i]

				info, err := os.Stat(selectedPath)
				if err != nil {
					return "", err
				}

				if info.IsDir() {
					currentDir = selectedPath
					break
				} else {
					return selectedPath, nil
				}
			}
		}
	}
}

func getUniqueFileName(fileName string) string {
	extName := filepath.Ext(fileName)
	baseName := filepath.Base(fileName)
	baseName = strings.TrimSuffix(baseName, extName)

	i := 0
	uniqueName := fileName
	isFileExists := func(f string) bool {
		_, ok := existFileSet[f]
		return ok
	}

	for isFileExists(uniqueName) {
		i++
		uniqueName = fmt.Sprintf("%s_%d%s", baseName, i, extName)
	}
	existFileSet[uniqueName] = struct{}{}
	println(uniqueName)
	return uniqueName
}
