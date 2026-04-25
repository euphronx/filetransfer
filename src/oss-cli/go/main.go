package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/AlecAivazis/survey/v2"
	"github.com/AlecAivazis/survey/v2/terminal"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"github.com/joho/godotenv"
)

type FileInfo struct {
	name         string
	size         int64
	storageClass string
}

func formatFileSize(size int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)

	switch {
	case size >= GB:
		return fmt.Sprintf("%.2f GB", float64(size)/GB)
	case size >= MB:
		return fmt.Sprintf("%.2f MB", float64(size)/MB)
	case size >= KB:
		return fmt.Sprintf("%.2f KB", float64(size)/KB)
	default:
		return fmt.Sprintf("%d B", size)
	}
}

var (
	today        = time.Now().Format("2006-01-02")
	existFileSet = make(map[string]struct{})

	config *oss.Config
	client *oss.Client
)

func init() {
	// Load envs
	godotenv.Load("../../../.env")

	// Initiate OSS client
	config = oss.LoadDefaultConfig().
		WithCredentialsProvider(credentials.NewStaticCredentialsProvider(os.Getenv("OSS_ACCESS_KEY_ID"), os.Getenv("OSS_ACCESS_KEY_SECRET"), "")).
		WithRegion("cn-shanghai")
	client = oss.NewClient(config)

	// Get exist files
	existFiles, err := listObj(fmt.Sprintf("files/%s", today))
	if err != nil {
		log.Fatalf("Something wrong with network connection")
	}
	for _, f := range existFiles {
		existFileSet[string([]rune(f.name)[17:])] = struct{}{}
	}
}

func main() {
	for {
		// Select action
		var action int
		err := survey.AskOne(&survey.Select{
			Message: "Select an action",
			Options: []string{"1. Upload", "2. Download", "3. Delete", "4. Exit"},
		}, &action)
		if err != nil && err == terminal.InterruptErr {
			fmt.Println()
			os.Exit(0)
		}

		switch action {
		case 0:
			// Upload
			filePath, err := getFile()
			if err != nil {
				if err == terminal.InterruptErr {
					fmt.Print("Cancel upload\n\n")
					continue
				} else {
					log.Fatalf("Error getting files: %v", err)
				}
			}

			fileName := filepath.Base(filePath)
			fileName = getUniqueFileName(fileName)
			objectName := fmt.Sprintf("files/%s/%s", today, fileName)

			err = putObj(objectName, filePath)
			if err != nil {
				log.Fatalf("Failed to list objects: %v", err)
			}

		case 1:
			// Download
			date, fileInfo, err := getFileByDate()
			if err == terminal.InterruptErr {
				fmt.Print("Cancel download\n\n")
				continue
			} else if err != nil {
				log.Fatalf("Failed to list objects: %v", err)
			}

			// Only files of standard storage class can be downloaded
			var standardFiles []FileInfo
			for _, file := range fileInfo {
				if file.storageClass == "Standard" {
					standardFiles = append(standardFiles, file)
				}
			}
			if len(fileInfo) == 0 || (action == 1 && len(standardFiles) == 0) {
				fmt.Printf("No files found on date %s\n\n", date)
				continue
			}

			var options []string
			for _, file := range standardFiles {
				options = append(options, string([]rune(file.name)[17:]))
			}
			var files []string
			err = survey.AskOne(&survey.MultiSelect{
				Message: "Select files to download",
				Options: options,
				Description: func(value string, idx int) string {
					return fmt.Sprintf("%s", formatFileSize(standardFiles[idx].size))
				},
			}, &files)
			if err != nil && err == terminal.InterruptErr {
				fmt.Print("Cancel download\n\n")
				continue
			}

			if len(files) == 0 {
				fmt.Print("No files selected\n\n")
				continue
			}

			wd, err := os.Getwd()
			downloadDir := filepath.Join(wd, "download", date)
			err = os.MkdirAll(downloadDir, 0755)
			if err != nil {
				log.Fatalf("Failed to create download directory: %v", err)
			}

			// Download selected files
			var wg sync.WaitGroup

			for _, file := range files {
				wg.Add(1)
				go func(file string) {
					defer wg.Done()

					fileName := fmt.Sprintf("files/%s/%s", date, file)
					filePath := fmt.Sprintf("%s/%s", downloadDir, file)
					getObj(file, filePath, fileName)
				}(file)
			}

			wg.Wait()
			fmt.Printf("Successfully downloaded all files to %s\n\n", downloadDir)

		case 2:
			// Delete
			date, fileInfo, err := getFileByDate()
			if err == terminal.InterruptErr {
				fmt.Print("Cancel delete\n\n")
				continue
			} else if err != nil {
				log.Fatalf("Failed to list objects: %v", err)
			}

			if fileInfo == nil {
				fmt.Printf("No files found on date %s\n\n", date)
				continue
			}

			var options []string
			for _, file := range fileInfo {
				options = append(options, string([]rune(file.name)[17:]))
			}
			var files []string
			err = survey.AskOne(&survey.MultiSelect{
				Message: "Select files to delete",
				Options: options,
			}, &files)
			if err == terminal.InterruptErr {
				fmt.Print("Cancel delete\n\n")
				continue
			}

			if len(files) == 0 {
				fmt.Print("No files selected\n\n")
				continue
			}

			var DeleteObjects []oss.DeleteObject
			for _, name := range files {
				DeleteObjects = append(DeleteObjects, oss.DeleteObject{Key: oss.Ptr(fmt.Sprintf("files/%s/%s", date, name))})
			}
			err = deleteMultiObj(DeleteObjects)
			if err != nil {
				log.Fatalf("failed to delete objects %v", err)
			}

		case 3:
			// Exit
			fmt.Println()
			os.Exit(0)
		}
	}
}
