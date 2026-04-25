package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

func putObj(objectName, filePath string) error {
	putRequest := &oss.PutObjectRequest{
		Bucket:       oss.Ptr("files-for-transfer"),
		Key:          oss.Ptr(objectName),
		StorageClass: oss.StorageClassStandard,
		Acl:          oss.ObjectACLPrivate,
	}

	_, err := client.PutObjectFromFile(context.TODO(), putRequest, filePath)
	if err != nil {
		return err
	}

	fmt.Printf("Successfully uploaded file \"%s\"\n\n", objectName)
	return nil
}

func listObj(prefix string) ([]FileInfo, error) {
	// Return a FileInfo list with prefix in file names
	var fileInfo []FileInfo
	listRequest := &oss.ListObjectsV2Request{
		Bucket: oss.Ptr("files-for-transfer"),
		Prefix: oss.Ptr(prefix),
	}
	for {
		// Liist files
		lsRes, err := client.ListObjectsV2(context.TODO(), listRequest)
		if err != nil {
			return nil, err
		}
		for _, object := range lsRes.Contents {
			fileInfo = append(fileInfo, FileInfo{*object.Key, object.Size, *object.StorageClass})
		}

		// Continue if there's more files
		if lsRes.IsTruncated {
			listRequest.ContinuationToken = lsRes.NextContinuationToken
		} else {
			break
		}
	}
	return fileInfo, nil
}

func getObj(fileName, downloadPath, fullName string) {
	fmt.Printf("Start to download file \"%s\"\n", fileName)

	getRequest := &oss.GetObjectRequest{
		Bucket: oss.Ptr("files-for-transfer"),
		Key:    oss.Ptr(fullName),
	}
	result, err := client.GetObject(context.TODO(), getRequest)
	if err != nil {
		fmt.Printf("Failed to download file \"%s\" (Error: %v)\n", fileName, err)
		return
	}
	defer result.Body.Close()

	// Create file
	localFile, err := os.Create(downloadPath)
	if err != nil {
		fmt.Printf("Failed to create file: \"%s\" (Error: %v)\n", fileName, err)
		return
	}
	defer localFile.Close()

	// Write file
	_, err = io.Copy(localFile, result.Body)
	if err != nil {
		fmt.Printf("Failed to write file: \"%s\" (Error: %v)\n", fileName, err)
		return
	}

	fmt.Printf("Downloaded file \"%s\"\n", fileName)
}

func deleteMultiObj(deleteObjects []oss.DeleteObject) error {
	deleteRequest := &oss.DeleteMultipleObjectsRequest{
		Bucket: oss.Ptr("files-for-transfer"),
		Delete: &oss.Delete{
			Objects: deleteObjects,
		},
	}
	_, err := client.DeleteMultipleObjects(context.TODO(), deleteRequest)
	if err != nil {
		log.Fatalf("failed to delete multiple objects %v", err)
		return err
	}
	fmt.Print("Successfully deleted\n\n")
	return nil
}
